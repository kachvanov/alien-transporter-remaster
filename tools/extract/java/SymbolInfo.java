import com.jpexs.decompiler.flash.SWF;
import com.jpexs.decompiler.flash.tags.*;
import com.jpexs.decompiler.flash.tags.base.*;
import com.jpexs.decompiler.flash.types.MATRIX;
import com.jpexs.decompiler.flash.types.RECT;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Usage: java -cp "vendor/jpexs/lib/*:build/extract/java" SymbolInfo <swf> <outDir> [placementsRegex]
 * Writes <outDir>/symbols.json and <outDir>/placements.json.
 * All coordinates are in pixels (twips / 20). Matrix is raw Flash (a,b,c,d,tx,ty).
 */
public class SymbolInfo {
  static String q(String s) {
    if (s == null) return "null";
    StringBuilder b = new StringBuilder("\"");
    for (char c : s.toCharArray()) {
      if (c == '"' || c == '\\') b.append('\\').append(c);
      else if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
      else b.append(c);
    }
    return b.append('"').toString();
  }
  static String rect(RECT r) {
    return "{\"xMin\":" + r.Xmin / 20.0 + ",\"yMin\":" + r.Ymin / 20.0 + ",\"xMax\":" + r.Xmax / 20.0 + ",\"yMax\":" + r.Ymax / 20.0 + "}";
  }
  static String kind(CharacterTag t) {
    if (t instanceof DefineSpriteTag) return "sprite";
    if (t instanceof ShapeTag) return "shape";
    if (t instanceof ImageTag) return "image";
    if (t instanceof DefineSoundTag) return "sound";
    return t.getClass().getSimpleName();
  }
  public static void main(String[] a) throws Exception {
    SWF swf = new SWF(new BufferedInputStream(new FileInputStream(a[0])), false);
    File out = new File(a[1]);
    out.mkdirs();
    String placeRe = a.length > 2 ? a[2] : "Level\\d\\dPhysic_mc|.*Model_mc|.*Ragdoll(\\d\\d)?_mc";
    Map<Integer, CharacterTag> chars = swf.getCharacters(false);

    StringBuilder sym = new StringBuilder("[\n");
    boolean first = true;
    for (Map.Entry<Integer, CharacterTag> e : chars.entrySet()) {
      CharacterTag t = e.getValue();
      if (t.getClassNames().isEmpty()) continue;
      String cls = t.getClassNames().iterator().next();
      sym.append(first ? "" : ",\n").append("{\"id\":").append(e.getKey()).append(",\"className\":").append(q(cls))
         .append(",\"kind\":").append(q(kind(t)));
      if (t instanceof DefineSpriteTag) sym.append(",\"frames\":").append(((DefineSpriteTag) t).getFrameCount());
      if (t instanceof DefineSoundTag) {
        DefineSoundTag s = (DefineSoundTag) t;
        int[] rates = {5512, 11025, 22050, 44100};
        int seek = 0;
        if (s.soundFormat == 2 && s.soundData.getLength() >= 2) {
          byte d0 = s.soundData.get(0), d1 = s.soundData.get(1);
          seek = (short) ((d0 & 0xff) | (d1 << 8));
        }
        sym.append(",\"sound\":{\"format\":").append(s.soundFormat).append(",\"rate\":").append(rates[s.soundRate])
           .append(",\"stereo\":").append(s.soundType).append(",\"sampleCount\":").append(s.soundSampleCount)
           .append(",\"seekSamples\":").append(seek).append("}");
      }
      if (t instanceof BoundedTag) {
        BoundedTag bt = (BoundedTag) t;
        sym.append(",\"rect\":").append(rect(bt.getRect())).append(",\"rectWithFilters\":").append(rect(bt.getRectWithFilters()));
      }
      sym.append("}");
      first = false;
    }
    sym.append("\n]\n");
    try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(out, "symbols.json")), StandardCharsets.UTF_8)) { w.write(sym.toString()); }

    StringBuilder pl = new StringBuilder("{\n");
    first = true;
    for (Map.Entry<Integer, CharacterTag> e : chars.entrySet()) {
      CharacterTag t = e.getValue();
      if (!(t instanceof DefineSpriteTag) || t.getClassNames().isEmpty()) continue;
      String cls = t.getClassNames().iterator().next();
      if (!cls.matches(placeRe)) continue;
      pl.append(first ? "" : ",\n").append(q(cls)).append(":[");
      boolean f2 = true;
      for (Tag tag : ((DefineSpriteTag) t).getTags()) {
        if (tag instanceof ShowFrameTag) break; // frame 1 only
        if (!(tag instanceof PlaceObjectTypeTag)) continue;
        PlaceObjectTypeTag p = (PlaceObjectTypeTag) tag;
        int cid = p.getCharacterId();
        CharacterTag ct = cid >= 0 ? chars.get(cid) : null;
        String ccls = ct != null && !ct.getClassNames().isEmpty() ? ct.getClassNames().iterator().next() : null;
        MATRIX m = p.getMatrix();
        double ma = 1, mb = 0, mc = 0, md = 1, tx = 0, ty = 0;
        if (m != null) {
          if (m.hasScale) { ma = m.scaleX; md = m.scaleY; }
          if (m.hasRotate) { mb = m.rotateSkew0; mc = m.rotateSkew1; }
          tx = m.translateX / 20.0; ty = m.translateY / 20.0;
        }
        pl.append(f2 ? "\n  " : ",\n  ").append("{\"depth\":").append(p.getDepth()).append(",\"characterId\":").append(cid)
          .append(",\"className\":").append(q(ccls)).append(",\"instanceName\":").append(q(p.getInstanceName()))
          .append(",\"move\":").append(p.flagMove())
          .append(",\"matrix\":[").append(ma).append(',').append(mb).append(',').append(mc).append(',').append(md).append(',').append(tx).append(',').append(ty).append("]}");
        f2 = false;
      }
      pl.append("\n]");
      first = false;
    }
    pl.append("\n}\n");
    try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(out, "placements.json")), StandardCharsets.UTF_8)) { w.write(pl.toString()); }
    System.out.println("OK");
    System.exit(0);
  }
}
