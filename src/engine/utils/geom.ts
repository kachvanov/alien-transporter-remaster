// Minimal analogues of flash.geom.Point / Rectangle / Matrix
// (Flash Player API semantics; docs/04-porting-guide.md §1).
//
// NOTE(T1.1): reference/as3 was not yet extracted when this file was written, so the
// API subset could not be collected by grep. The commonly used part of each class is
// implemented; unused members can be trimmed once T0.2 lands.

export class Point {
  x: number;
  y: number;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  get length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  static distance(pt1: Point, pt2: Point): number {
    const dx = pt1.x - pt2.x;
    const dy = pt1.y - pt2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static interpolate(pt1: Point, pt2: Point, f: number): Point {
    return new Point(pt2.x + (pt1.x - pt2.x) * f, pt2.y + (pt1.y - pt2.y) * f);
  }

  static polar(len: number, angle: number): Point {
    return new Point(len * Math.cos(angle), len * Math.sin(angle));
  }

  add(v: Point): Point {
    return new Point(this.x + v.x, this.y + v.y);
  }

  subtract(v: Point): Point {
    return new Point(this.x - v.x, this.y - v.y);
  }

  clone(): Point {
    return new Point(this.x, this.y);
  }

  copyFrom(sourcePoint: Point): void {
    this.x = sourcePoint.x;
    this.y = sourcePoint.y;
  }

  setTo(xa: number, ya: number): void {
    this.x = xa;
    this.y = ya;
  }

  equals(toCompare: Point): boolean {
    return this.x === toCompare.x && this.y === toCompare.y;
  }

  normalize(thickness: number): void {
    const len = this.length;
    if (len > 0) {
      const k = thickness / len;
      this.x *= k;
      this.y *= k;
    }
  }

  offset(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  toString(): string {
    return '(x=' + this.x + ', y=' + this.y + ')';
  }
}

export class Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  get left(): number {
    return this.x;
  }
  set left(value: number) {
    this.width += this.x - value;
    this.x = value;
  }

  get right(): number {
    return this.x + this.width;
  }
  set right(value: number) {
    this.width = value - this.x;
  }

  get top(): number {
    return this.y;
  }
  set top(value: number) {
    this.height += this.y - value;
    this.y = value;
  }

  get bottom(): number {
    return this.y + this.height;
  }
  set bottom(value: number) {
    this.height = value - this.y;
  }

  get topLeft(): Point {
    return new Point(this.x, this.y);
  }

  get bottomRight(): Point {
    return new Point(this.x + this.width, this.y + this.height);
  }

  get size(): Point {
    return new Point(this.width, this.height);
  }

  clone(): Rectangle {
    return new Rectangle(this.x, this.y, this.width, this.height);
  }

  copyFrom(sourceRect: Rectangle): void {
    this.x = sourceRect.x;
    this.y = sourceRect.y;
    this.width = sourceRect.width;
    this.height = sourceRect.height;
  }

  setTo(xa: number, ya: number, widtha: number, heighta: number): void {
    this.x = xa;
    this.y = ya;
    this.width = widtha;
    this.height = heighta;
  }

  /** Flash: left/top inclusive, right/bottom exclusive. */
  contains(x: number, y: number): boolean {
    return x >= this.x && x < this.x + this.width && y >= this.y && y < this.y + this.height;
  }

  containsPoint(point: Point): boolean {
    return this.contains(point.x, point.y);
  }

  containsRect(rect: Rectangle): boolean {
    return (
      rect.x >= this.x &&
      rect.y >= this.y &&
      rect.x + rect.width <= this.x + this.width &&
      rect.y + rect.height <= this.y + this.height
    );
  }

  equals(toCompare: Rectangle): boolean {
    return (
      this.x === toCompare.x &&
      this.y === toCompare.y &&
      this.width === toCompare.width &&
      this.height === toCompare.height
    );
  }

  inflate(dx: number, dy: number): void {
    this.x -= dx;
    this.width += 2 * dx;
    this.y -= dy;
    this.height += 2 * dy;
  }

  inflatePoint(point: Point): void {
    this.inflate(point.x, point.y);
  }

  intersection(toIntersect: Rectangle): Rectangle {
    const x0 = Math.max(this.x, toIntersect.x);
    const x1 = Math.min(this.x + this.width, toIntersect.x + toIntersect.width);
    if (x0 <= x1) {
      const y0 = Math.max(this.y, toIntersect.y);
      const y1 = Math.min(this.y + this.height, toIntersect.y + toIntersect.height);
      if (y0 <= y1) return new Rectangle(x0, y0, x1 - x0, y1 - y0);
    }
    return new Rectangle(0, 0, 0, 0);
  }

  intersects(toIntersect: Rectangle): boolean {
    const r = this.intersection(toIntersect);
    return r.width > 0 && r.height > 0;
  }

  isEmpty(): boolean {
    return this.width <= 0 || this.height <= 0;
  }

  offset(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  offsetPoint(point: Point): void {
    this.offset(point.x, point.y);
  }

  setEmpty(): void {
    this.x = 0;
    this.y = 0;
    this.width = 0;
    this.height = 0;
  }

  union(toUnion: Rectangle): Rectangle {
    if (this.width === 0 || this.height === 0) return toUnion.clone();
    if (toUnion.width === 0 || toUnion.height === 0) return this.clone();
    const x0 = Math.min(this.x, toUnion.x);
    const y0 = Math.min(this.y, toUnion.y);
    const x1 = Math.max(this.x + this.width, toUnion.x + toUnion.width);
    const y1 = Math.max(this.y + this.height, toUnion.y + toUnion.height);
    return new Rectangle(x0, y0, x1 - x0, y1 - y0);
  }

  toString(): string {
    return (
      '(x=' + this.x + ', y=' + this.y + ', w=' + this.width + ', h=' + this.height + ')'
    );
  }
}

export class Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;

  constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) {
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  clone(): Matrix {
    return new Matrix(this.a, this.b, this.c, this.d, this.tx, this.ty);
  }

  copyFrom(sourceMatrix: Matrix): void {
    this.a = sourceMatrix.a;
    this.b = sourceMatrix.b;
    this.c = sourceMatrix.c;
    this.d = sourceMatrix.d;
    this.tx = sourceMatrix.tx;
    this.ty = sourceMatrix.ty;
  }

  setTo(aa: number, ba: number, ca: number, da: number, txa: number, tya: number): void {
    this.a = aa;
    this.b = ba;
    this.c = ca;
    this.d = da;
    this.tx = txa;
    this.ty = tya;
  }

  identity(): void {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.tx = 0;
    this.ty = 0;
  }

  /** this = this x m (this is applied first, then m), as in flash.geom.Matrix.concat. */
  concat(m: Matrix): void {
    const a = this.a * m.a + this.b * m.c;
    const b = this.a * m.b + this.b * m.d;
    const c = this.c * m.a + this.d * m.c;
    const d = this.c * m.b + this.d * m.d;
    const tx = this.tx * m.a + this.ty * m.c + m.tx;
    const ty = this.tx * m.b + this.ty * m.d + m.ty;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  createBox(scaleX: number, scaleY: number, rotation = 0, tx = 0, ty = 0): void {
    this.identity();
    this.rotate(rotation);
    this.scale(scaleX, scaleY);
    this.tx = tx;
    this.ty = ty;
  }

  deltaTransformPoint(point: Point): Point {
    return new Point(this.a * point.x + this.c * point.y, this.b * point.x + this.d * point.y);
  }

  /** Singular matrices become identity (Flash behaviour for det = 0 is unspecified). */
  invert(): void {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      this.identity();
      return;
    }
    const a = this.d / det;
    const b = -this.b / det;
    const c = -this.c / det;
    const d = this.a / det;
    const tx = (this.c * this.ty - this.d * this.tx) / det;
    const ty = -(this.a * this.ty - this.b * this.tx) / det;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  /** Angle in radians (positive = clockwise on screen, y down). */
  rotate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const a = this.a * cos - this.b * sin;
    const b = this.a * sin + this.b * cos;
    const c = this.c * cos - this.d * sin;
    const d = this.c * sin + this.d * cos;
    const tx = this.tx * cos - this.ty * sin;
    const ty = this.tx * sin + this.ty * cos;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
    this.tx = tx;
    this.ty = ty;
  }

  scale(sx: number, sy: number): void {
    this.a *= sx;
    this.b *= sy;
    this.c *= sx;
    this.d *= sy;
    this.tx *= sx;
    this.ty *= sy;
  }

  translate(dx: number, dy: number): void {
    this.tx += dx;
    this.ty += dy;
  }

  transformPoint(point: Point): Point {
    return new Point(
      this.a * point.x + this.c * point.y + this.tx,
      this.b * point.x + this.d * point.y + this.ty,
    );
  }

  toString(): string {
    return (
      '(a=' + this.a + ', b=' + this.b + ', c=' + this.c + ', d=' + this.d + ', tx=' + this.tx + ', ty=' + this.ty + ')'
    );
  }
}
