// Flat re-export of the box2dweb classes used by the game (docs/04-porting-guide.md section 7).
//
// box2dweb is CommonJS (`module.exports = Box2D`), so the default import goes through the bundler's CJS
// interop (Vite/esbuild, Vitest/Node). The package file is used as is: no patch-package, no copy into src/;
// tests/unit/physics.test.ts checks its SHA-256.

// The reference keeps the ambient `declare module 'box2dweb'` in force for every tsconfig project that reaches
// this file (tsconfig.node.json compiles tests/** and tools/** but does not include src/**).
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./box2d.d.ts" />

import Box2D from 'box2dweb';

// Box2D.Common.Math
export const b2Vec2 = Box2D.Common.Math.b2Vec2;
export type b2Vec2 = Box2D.Common.Math.b2Vec2;
export const b2Mat22 = Box2D.Common.Math.b2Mat22;
export type b2Mat22 = Box2D.Common.Math.b2Mat22;
export const b2Transform = Box2D.Common.Math.b2Transform;
export type b2Transform = Box2D.Common.Math.b2Transform;
export const b2Math = Box2D.Common.Math.b2Math;
export type b2Math = Box2D.Common.Math.b2Math;

// Box2D.Collision
export const b2AABB = Box2D.Collision.b2AABB;
export type b2AABB = Box2D.Collision.b2AABB;
export const b2Manifold = Box2D.Collision.b2Manifold;
export type b2Manifold = Box2D.Collision.b2Manifold;
export const b2WorldManifold = Box2D.Collision.b2WorldManifold;
export type b2WorldManifold = Box2D.Collision.b2WorldManifold;
export const b2SimplexCache = Box2D.Collision.b2SimplexCache;
export type b2SimplexCache = Box2D.Collision.b2SimplexCache;
export const b2DistanceProxy = Box2D.Collision.b2DistanceProxy;
export type b2DistanceProxy = Box2D.Collision.b2DistanceProxy;
export const b2DistanceInput = Box2D.Collision.b2DistanceInput;
export type b2DistanceInput = Box2D.Collision.b2DistanceInput;
export const b2DistanceOutput = Box2D.Collision.b2DistanceOutput;
export type b2DistanceOutput = Box2D.Collision.b2DistanceOutput;
export const b2Distance = Box2D.Collision.b2Distance;
export type b2Distance = Box2D.Collision.b2Distance;

// Box2D.Collision.Shapes
export const b2MassData = Box2D.Collision.Shapes.b2MassData;
export type b2MassData = Box2D.Collision.Shapes.b2MassData;
export const b2Shape = Box2D.Collision.Shapes.b2Shape;
export type b2Shape = Box2D.Collision.Shapes.b2Shape;
export const b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape;
export type b2PolygonShape = Box2D.Collision.Shapes.b2PolygonShape;
export const b2CircleShape = Box2D.Collision.Shapes.b2CircleShape;
export type b2CircleShape = Box2D.Collision.Shapes.b2CircleShape;

// Box2D.Dynamics.Contacts
export const b2Contact = Box2D.Dynamics.Contacts.b2Contact;
export type b2Contact = Box2D.Dynamics.Contacts.b2Contact;

// Box2D.Dynamics.Joints
export const b2JointEdge = Box2D.Dynamics.Joints.b2JointEdge;
export type b2JointEdge = Box2D.Dynamics.Joints.b2JointEdge;
export const b2Joint = Box2D.Dynamics.Joints.b2Joint;
export type b2Joint = Box2D.Dynamics.Joints.b2Joint;
export const b2JointDef = Box2D.Dynamics.Joints.b2JointDef;
export type b2JointDef = Box2D.Dynamics.Joints.b2JointDef;
export const b2RevoluteJointDef = Box2D.Dynamics.Joints.b2RevoluteJointDef;
export type b2RevoluteJointDef = Box2D.Dynamics.Joints.b2RevoluteJointDef;
export const b2RevoluteJoint = Box2D.Dynamics.Joints.b2RevoluteJoint;
export type b2RevoluteJoint = Box2D.Dynamics.Joints.b2RevoluteJoint;
export const b2PrismaticJointDef = Box2D.Dynamics.Joints.b2PrismaticJointDef;
export type b2PrismaticJointDef = Box2D.Dynamics.Joints.b2PrismaticJointDef;
export const b2PrismaticJoint = Box2D.Dynamics.Joints.b2PrismaticJoint;
export type b2PrismaticJoint = Box2D.Dynamics.Joints.b2PrismaticJoint;
export const b2MouseJointDef = Box2D.Dynamics.Joints.b2MouseJointDef;
export type b2MouseJointDef = Box2D.Dynamics.Joints.b2MouseJointDef;
export const b2MouseJoint = Box2D.Dynamics.Joints.b2MouseJoint;
export type b2MouseJoint = Box2D.Dynamics.Joints.b2MouseJoint;

// Box2D.Dynamics
export const b2FilterData = Box2D.Dynamics.b2FilterData;
export type b2FilterData = Box2D.Dynamics.b2FilterData;
export const b2FixtureDef = Box2D.Dynamics.b2FixtureDef;
export type b2FixtureDef = Box2D.Dynamics.b2FixtureDef;
export const b2Fixture = Box2D.Dynamics.b2Fixture;
export type b2Fixture = Box2D.Dynamics.b2Fixture;
export const b2BodyDef = Box2D.Dynamics.b2BodyDef;
export type b2BodyDef = Box2D.Dynamics.b2BodyDef;
export const b2Body = Box2D.Dynamics.b2Body;
export type b2Body = Box2D.Dynamics.b2Body;
export const b2ContactFilter = Box2D.Dynamics.b2ContactFilter;
export type b2ContactFilter = Box2D.Dynamics.b2ContactFilter;
export const b2ContactImpulse = Box2D.Dynamics.b2ContactImpulse;
export type b2ContactImpulse = Box2D.Dynamics.b2ContactImpulse;
export const b2ContactListener = Box2D.Dynamics.b2ContactListener;
export type b2ContactListener = Box2D.Dynamics.b2ContactListener;
export const b2World = Box2D.Dynamics.b2World;
export type b2World = Box2D.Dynamics.b2World;
