// Port of ru/antkarlov/anthill/plugins/box2d/AntBox2DContactListener.as

import { asType } from '../../engine/utils/cast';
import { b2ContactListener } from '../box2dweb';
import type { b2Contact, b2ContactImpulse } from '../box2dweb';
import { AntBox2DBody } from './AntBox2DBody';
import { AntBox2DContact } from './AntBox2DContact';

export class AntBox2DContactListener extends b2ContactListener {
  //---------------------------------------
  // PRIVATE VARIABLES
  //---------------------------------------

  // The listener works with the bodies of the fixtures of a contact; a fixture without an AntBox2DBody as
  // user data throws a TypeError here, exactly as the AS3 null dereference does.
  private _bodyA: AntBox2DBody | null = null;
  private _bodyB: AntBox2DBody | null = null;
  private _contact: AntBox2DContact | null = null;

  //---------------------------------------
  // CONSTRUCTOR
  //---------------------------------------

  constructor() {
    super();
    this._bodyA = null;
    this._bodyB = null;
    this._contact = null;
  }

  //---------------------------------------
  // PUBLIC METHODS
  //---------------------------------------

  override PreSolve(aContact: b2Contact): void {
    this._bodyA = asType(aContact.GetFixtureA().GetUserData(), AntBox2DBody);
    this._bodyB = asType(aContact.GetFixtureB().GetUserData(), AntBox2DBody);
    this._contact = AntBox2DContact.get();
    this._contact.setData(aContact);
    if ((this._bodyA as AntBox2DBody).allowPreSolveContacts) {
      (this._bodyA as AntBox2DBody).preSolveContact(this._contact);
    }

    if ((this._bodyB as AntBox2DBody).allowPreSolveContacts) {
      (this._bodyB as AntBox2DBody).preSolveContact(this._contact);
    }

    this._contact.resetData();
    AntBox2DContact.set(this._contact);
  }

  override BeginContact(aContact: b2Contact): void {
    this._bodyA = asType(aContact.GetFixtureA().GetUserData(), AntBox2DBody);
    this._bodyB = asType(aContact.GetFixtureB().GetUserData(), AntBox2DBody);
    this._contact = AntBox2DContact.get();
    this._contact.setData(aContact);
    if ((this._bodyA as AntBox2DBody).allowBeginContacts) {
      (this._bodyA as AntBox2DBody).beginContact(this._contact);
    }

    if ((this._bodyB as AntBox2DBody).allowBeginContacts) {
      (this._bodyB as AntBox2DBody).beginContact(this._contact);
    }

    this._contact.resetData();
    AntBox2DContact.set(this._contact);
  }

  override EndContact(aContact: b2Contact): void {
    this._bodyA = asType(aContact.GetFixtureA().GetUserData(), AntBox2DBody);
    this._bodyB = asType(aContact.GetFixtureB().GetUserData(), AntBox2DBody);
    this._contact = AntBox2DContact.get();
    this._contact.setData(aContact);
    if ((this._bodyA as AntBox2DBody).allowEndContacts) {
      (this._bodyA as AntBox2DBody).endContact(this._contact);
    }

    if ((this._bodyB as AntBox2DBody).allowEndContacts) {
      (this._bodyB as AntBox2DBody).endContact(this._contact);
    }

    this._contact.resetData();
    AntBox2DContact.set(this._contact);
  }

  override PostSolve(aContact: b2Contact, aImpulse: b2ContactImpulse): void {
    this._bodyA = asType(aContact.GetFixtureA().GetUserData(), AntBox2DBody);
    this._bodyB = asType(aContact.GetFixtureB().GetUserData(), AntBox2DBody);
    this._contact = AntBox2DContact.get();
    this._contact.setData(aContact);
    this._contact.impulse = aImpulse.normalImpulses[0] as number;
    if ((this._bodyA as AntBox2DBody).allowPostSolveContacts) {
      (this._bodyA as AntBox2DBody).postSolveContact(this._contact);
    }

    if ((this._bodyB as AntBox2DBody).allowPostSolveContacts) {
      (this._bodyB as AntBox2DBody).postSolveContact(this._contact);
    }

    this._contact.resetData();
    AntBox2DContact.set(this._contact);
  }
}
