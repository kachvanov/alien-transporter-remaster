// Port of ru/antkarlov/anthill/plugins/box2d/AntBox2DContact.as

import { asType } from '../../engine/utils/cast';
import { b2WorldManifold } from '../box2dweb';
import type { b2Contact, b2Fixture, b2Vec2 } from '../box2dweb';
import { AntBox2DBody } from './AntBox2DBody';
import type { AntBox2DManager } from './AntBox2DManager';

export class AntBox2DContact {
  //---------------------------------------
  // CLASS CONSTANTS
  //---------------------------------------

  private static _cache: (AntBox2DContact | null)[] | null = null; // Vector.<AntBox2DContact> (fixed)
  private static readonly MAX_CACHE_CAPACITY = 100; // int
  private static _numCacheItems = 0; // int

  //---------------------------------------
  // PUBLIC VARIABLES
  //---------------------------------------

  collider: AntBox2DBody | null = null;
  collidee: AntBox2DBody | null = null;
  colliderFixture: b2Fixture | null = null;
  collideeFixture: b2Fixture | null = null;
  positionX: number = NaN;
  positionY: number = NaN;
  normalX: number = NaN;
  normalY: number = NaN;
  impulse: number = NaN;
  isTouching = false;
  isContinuous = false;
  isSensor = false;

  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  private _worldManifold: b2WorldManifold;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor(aContact: b2Contact | null = null) {
    this._worldManifold = new b2WorldManifold();
    if (aContact != null) {
      this.setData(aContact);
    } else {
      this.resetData();
    }
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  static get(): AntBox2DContact {
    if (AntBox2DContact._cache == null) {
      return new AntBox2DContact();
    }

    if (AntBox2DContact._numCacheItems > 0) {
      --AntBox2DContact._numCacheItems;
      const contact = AntBox2DContact._cache[AntBox2DContact._numCacheItems] as AntBox2DContact;
      AntBox2DContact._cache[AntBox2DContact._numCacheItems] = null;
      return contact;
    }

    return new AntBox2DContact();
  }

  static set(aContact: AntBox2DContact): void {
    if (AntBox2DContact._cache == null) {
      AntBox2DContact._cache = new Array<AntBox2DContact | null>(AntBox2DContact.MAX_CACHE_CAPACITY).fill(null);
      AntBox2DContact._cache[AntBox2DContact._numCacheItems] = aContact;
      ++AntBox2DContact._numCacheItems;
      return;
    }

    if (AntBox2DContact._numCacheItems < AntBox2DContact.MAX_CACHE_CAPACITY) {
      AntBox2DContact._cache[AntBox2DContact._numCacheItems] = aContact;
      ++AntBox2DContact._numCacheItems;
    }
  }

  static get numCacheItems(): number {
    return AntBox2DContact._numCacheItems;
  }

  setData(aContact: b2Contact): void {
    this.colliderFixture = aContact.GetFixtureA();
    this.collideeFixture = aContact.GetFixtureB();
    this.collider = asType(this.colliderFixture.GetUserData(), AntBox2DBody);
    this.collidee = asType(this.collideeFixture.GetUserData(), AntBox2DBody);
    const scale =
      this.collider != null
        ? (this.collider.manager as AntBox2DManager).scale
        : this.collidee != null
          ? (this.collidee.manager as AntBox2DManager).scale
          : 30;
    aContact.GetWorldManifold(this._worldManifold);
    if (this._worldManifold.m_points.length > 0) {
      this.positionX = (this._worldManifold.m_points[0] as b2Vec2).x * scale;
      this.positionY = (this._worldManifold.m_points[0] as b2Vec2).y * scale;
    }

    this.impulse = 0;
    this.normalX = this._worldManifold.m_normal.x;
    this.normalY = this._worldManifold.m_normal.y;
    this.isTouching = aContact.IsTouching();
    this.isContinuous = aContact.IsContinuous();
    this.isSensor = aContact.IsSensor();
  }

  resetData(): void {
    this.colliderFixture = null;
    this.collideeFixture = null;
    this.collider = null;
    this.collidee = null;
    this.positionX = 0;
    this.positionY = 0;
    this.impulse = 0;
    this.isTouching = false;
    this.isContinuous = false;
    this.isSensor = false;
  }

  copyFrom(aContact: AntBox2DContact): void {
    this.colliderFixture = aContact.colliderFixture;
    this.collideeFixture = aContact.collideeFixture;
    this.collider = aContact.collider;
    this.collidee = aContact.collidee;
    this.positionX = aContact.positionX;
    this.positionY = aContact.positionY;
    this.impulse = aContact.impulse;
    this.isTouching = aContact.isTouching;
    this.isContinuous = aContact.isContinuous;
    this.isSensor = aContact.isSensor;
  }
}
