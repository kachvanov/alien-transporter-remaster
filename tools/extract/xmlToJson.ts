// Universal XML -> JSON converter of the extraction pipeline (docs/04-porting-guide.md §5).
//
// Convention (mirrors the E4X access of the original: `xml.Mission`, `m.SubProp.(@name == "x").@value`):
//   - the result describes the root element itself (its name is dropped: the file name says what it is);
//   - attributes -> fields; ALL values stay strings (the AS3 code does Number()/int()/parseFloat() itself);
//   - child elements -> arrays under the tag name, ALWAYS arrays (even for a single child), in document order;
//   - text of an element -> "#text" (only when non-blank); comments and the XML declaration are dropped;
//   - key order: attributes first, then child tags in order of first appearance.
import { XMLParser } from 'fast-xml-parser';

export type XmlValue = string | XmlNode | XmlNode[];
export interface XmlNode {
  [key: string]: XmlValue;
}

const TEXT = '#text';
const ATTRS = ':@';

// fast-xml-parser `preserveOrder` item: `{ tag: [children...], ':@': { attr: value } }` or `{ '#text': 'x' }`.
type OrderedItem = Record<string, unknown>;

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseAttributeValue: false,
  parseTagValue: false,
  // false: attribute values stay verbatim (Font `<Char name=" "/>` is the space glyph); element text is trimmed below.
  trimValues: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  processEntities: true,
  textNodeName: TEXT,
});

function tagOf(item: OrderedItem): string | undefined {
  return Object.keys(item).find((k) => k !== ATTRS);
}

function convertElement(tag: string, item: OrderedItem): XmlNode {
  const node: XmlNode = {};
  const attrs = (item[ATTRS] ?? {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(attrs)) node[k] = String(v);
  const children = (item[tag] ?? []) as OrderedItem[];
  const text: string[] = [];
  for (const child of children) {
    const childTag = tagOf(child);
    if (childTag === undefined) continue;
    if (childTag === TEXT) {
      text.push(String(child[TEXT]));
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(node, childTag) && !Array.isArray(node[childTag])) {
      throw new Error(`xmlToJson: <${tag}> has attribute and child element both named "${childTag}"`);
    }
    const list = (node[childTag] ??= []) as XmlNode[];
    list.push(convertElement(childTag, child));
  }
  const joined = text.join('').trim();
  if (joined !== '') node[TEXT] = joined;
  return node;
}

/** Converts an XML document into the JSON tree described above. */
export function xmlToJson(xml: string): XmlNode {
  const doc = parser.parse(xml) as OrderedItem[];
  const roots = doc.filter((i) => {
    const t = tagOf(i);
    return t !== undefined && t !== TEXT;
  });
  if (roots.length !== 1) throw new Error(`xmlToJson: expected one root element, got ${roots.length}`);
  const root = roots[0] as OrderedItem;
  return convertElement(tagOf(root) as string, root);
}
