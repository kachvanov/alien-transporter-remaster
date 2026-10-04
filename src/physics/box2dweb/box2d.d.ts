// Types for the part of box2dweb 2.1.0-b (Box2D 2.1a, the JS port of Box2DFlash) that the game and the
// Anthill plugin actually use. The list comes from `grep b2[A-Z]\w*` and the method calls in
// reference/as3/ru/** (plugins/box2d/** and the game). box2dweb ships without typings; the JS file itself
// is never patched or copied (a test checks its SHA-256).
//
// Differences from the Box2DFlash "2.1alpha" API that the SWF was compiled against (none breaks the port):
//  - `b2Body.GetLinearVelocity()/GetPosition()` return the live internal vector in both engines;
//  - `b2SimplexCache.count` is not initialised by the box2dweb constructor (the plugin sets it, as in AS3);
//  - `b2DistanceOutput.distance` is undefined until `b2Distance.Distance` runs.

declare module 'box2dweb' {
  namespace Box2D {
    namespace Common {
      namespace Math {
        class b2Vec2 {
          x: number;
          y: number;
          constructor(x?: number, y?: number);
          static Make(x: number, y: number): b2Vec2;
          SetZero(): void;
          Set(x: number, y: number): void;
          SetV(v: b2Vec2): void;
          Copy(): b2Vec2;
          Add(v: b2Vec2): void;
          Subtract(v: b2Vec2): void;
          Multiply(a: number): void;
          Length(): number;
          LengthSquared(): number;
          Normalize(): number;
        }

        class b2Mat22 {
          col1: b2Vec2;
          col2: b2Vec2;
        }

        class b2Transform {
          position: b2Vec2;
          R: b2Mat22;
        }

        class b2Math {
          static Dot(a: b2Vec2, b: b2Vec2): number;
          static MulX(T: b2Transform, v: b2Vec2): b2Vec2;
          static MulMV(A: b2Mat22, v: b2Vec2): b2Vec2;
        }
      }
    }

    namespace Collision {
      class b2AABB {
        lowerBound: Common.Math.b2Vec2;
        upperBound: Common.Math.b2Vec2;
      }

      class b2Manifold {
        m_pointCount: number;
      }

      class b2WorldManifold {
        m_normal: Common.Math.b2Vec2;
        m_points: Common.Math.b2Vec2[];
      }

      class b2SimplexCache {
        count: number;
        indexA: number[];
        indexB: number[];
        metric: number;
      }

      class b2DistanceProxy {
        Set(shape: Shapes.b2Shape): void;
      }

      class b2DistanceInput {
        proxyA: b2DistanceProxy;
        proxyB: b2DistanceProxy;
        transformA: Common.Math.b2Transform;
        transformB: Common.Math.b2Transform;
        useRadii: boolean;
      }

      class b2DistanceOutput {
        pointA: Common.Math.b2Vec2;
        pointB: Common.Math.b2Vec2;
        distance: number;
        iterations: number;
      }

      class b2Distance {
        static Distance(output: b2DistanceOutput, cache: b2SimplexCache, input: b2DistanceInput): void;
      }

      namespace Shapes {
        class b2MassData {
          mass: number;
          center: Common.Math.b2Vec2;
          I: number;
        }

        class b2Shape {
          static readonly e_unknownShape: number;
          static readonly e_circleShape: number;
          static readonly e_polygonShape: number;
          GetType(): number;
          TestPoint(xf: Common.Math.b2Transform, p: Common.Math.b2Vec2): boolean;
          ComputeAABB(aabb: b2AABB, xf: Common.Math.b2Transform): void;
        }

        class b2PolygonShape extends b2Shape {
          SetAsBox(hx: number, hy: number): void;
          SetAsOrientedBox(hx: number, hy: number, center?: Common.Math.b2Vec2, angle?: number): void;
          GetVertices(): Common.Math.b2Vec2[];
          GetVertexCount(): number;
          GetNormals(): Common.Math.b2Vec2[];
        }

        class b2CircleShape extends b2Shape {
          constructor(radius?: number);
          SetLocalPosition(position: Common.Math.b2Vec2): void;
          GetLocalPosition(): Common.Math.b2Vec2;
          GetRadius(): number;
        }
      }
    }

    namespace Dynamics {
      namespace Contacts {
        class b2Contact {
          GetFixtureA(): b2Fixture;
          GetFixtureB(): b2Fixture;
          GetWorldManifold(worldManifold: Collision.b2WorldManifold): void;
          IsTouching(): boolean;
          IsContinuous(): boolean;
          IsSensor(): boolean;
        }
      }

      namespace Joints {
        class b2JointEdge {
          other: b2Body;
          joint: b2Joint;
          prev: b2JointEdge | null;
          next: b2JointEdge | null;
        }

        class b2Joint {
          GetAnchorA(): Common.Math.b2Vec2;
          GetAnchorB(): Common.Math.b2Vec2;
          GetReactionForce(inv_dt: number): Common.Math.b2Vec2;
          GetBodyA(): b2Body;
          GetBodyB(): b2Body;
          GetNext(): b2Joint | null;
        }

        class b2JointDef {
          bodyA: b2Body;
          bodyB: b2Body;
          collideConnected: boolean;
          userData: unknown;
        }

        class b2RevoluteJointDef extends b2JointDef {
          enableLimit: boolean;
          enableMotor: boolean;
          lowerAngle: number;
          upperAngle: number;
          maxMotorTorque: number;
          motorSpeed: number;
          Initialize(bA: b2Body, bB: b2Body, anchor: Common.Math.b2Vec2): void;
        }

        class b2RevoluteJoint extends b2Joint {
          GetJointAngle(): number;
          GetJointSpeed(): number;
          EnableMotor(flag: boolean): void;
          SetMotorSpeed(speed: number): void;
          SetMaxMotorTorque(torque: number): void;
          EnableLimit(flag: boolean): void;
          SetLimits(lower: number, upper: number): void;
        }

        class b2PrismaticJointDef extends b2JointDef {
          enableLimit: boolean;
          enableMotor: boolean;
          lowerTranslation: number;
          upperTranslation: number;
          maxMotorForce: number;
          motorSpeed: number;
          Initialize(bA: b2Body, bB: b2Body, anchor: Common.Math.b2Vec2, axis: Common.Math.b2Vec2): void;
        }

        class b2PrismaticJoint extends b2Joint {
          GetJointSpeed(): number;
          EnableMotor(flag: boolean): void;
          SetMotorSpeed(speed: number): void;
          SetMaxMotorForce(force: number): void;
          EnableLimit(flag: boolean): void;
          SetLimits(lower: number, upper: number): void;
        }

        class b2MouseJointDef extends b2JointDef {
          target: Common.Math.b2Vec2;
          maxForce: number;
          frequencyHz: number;
          dampingRatio: number;
        }

        class b2MouseJoint extends b2Joint {
          SetTarget(target: Common.Math.b2Vec2): void;
          SetMaxForce(force: number): void;
          SetFrequency(hz: number): void;
          SetDampingRatio(ratio: number): void;
        }
      }

      class b2FilterData {
        categoryBits: number;
        maskBits: number;
        groupIndex: number;
      }

      class b2FixtureDef {
        shape: Collision.Shapes.b2Shape | null;
        userData: unknown;
        friction: number;
        restitution: number;
        density: number;
        isSensor: boolean;
        filter: b2FilterData;
      }

      class b2Fixture {
        GetBody(): b2Body;
        GetShape(): Collision.Shapes.b2Shape;
        GetNext(): b2Fixture | null;
        GetUserData(): unknown;
        IsSensor(): boolean;
        GetType(): number;
        TestPoint(p: Common.Math.b2Vec2): boolean;
      }

      class b2BodyDef {
        type: number;
        position: Common.Math.b2Vec2;
        angle: number;
        linearVelocity: Common.Math.b2Vec2;
        angularVelocity: number;
        linearDamping: number;
        angularDamping: number;
        allowSleep: boolean;
        awake: boolean;
        fixedRotation: boolean;
        bullet: boolean;
        active: boolean;
        inertiaScale: number;
        userData: unknown;
      }

      class b2Body {
        static readonly b2_staticBody: number;
        static readonly b2_kinematicBody: number;
        static readonly b2_dynamicBody: number;
        CreateFixture(def: b2FixtureDef): b2Fixture;
        DestroyFixture(fixture: b2Fixture): void;
        GetFixtureList(): b2Fixture | null;
        GetJointList(): Joints.b2JointEdge | null;
        GetNext(): b2Body | null;
        SetType(type: number): void;
        GetType(): number;
        SetMassData(massData: Collision.Shapes.b2MassData): void;
        ResetMassData(): void;
        GetMass(): number;
        GetInertia(): number;
        GetLocalCenter(): Common.Math.b2Vec2;
        GetWorldCenter(): Common.Math.b2Vec2;
        SetAwake(flag: boolean): void;
        IsAwake(): boolean;
        SetSleepingAllowed(flag: boolean): void;
        SetBullet(flag: boolean): void;
        ApplyImpulse(impulse: Common.Math.b2Vec2, point: Common.Math.b2Vec2): void;
        ApplyForce(force: Common.Math.b2Vec2, point: Common.Math.b2Vec2): void;
        ApplyTorque(torque: number): void;
        SetAngularVelocity(omega: number): void;
        GetAngularVelocity(): number;
        SetLinearVelocity(v: Common.Math.b2Vec2): void;
        GetLinearVelocity(): Common.Math.b2Vec2;
        SetPosition(position: Common.Math.b2Vec2): void;
        GetPosition(): Common.Math.b2Vec2;
        SetAngle(angle: number): void;
        GetAngle(): number;
        GetTransform(): Common.Math.b2Transform;
        GetUserData(): unknown;
        SetUserData(data: unknown): void;
      }

      class b2ContactFilter {
        ShouldCollide(fixtureA: b2Fixture, fixtureB: b2Fixture): boolean;
      }

      class b2ContactImpulse {
        normalImpulses: number[];
        tangentImpulses: number[];
      }

      class b2ContactListener {
        BeginContact(contact: Contacts.b2Contact): void;
        EndContact(contact: Contacts.b2Contact): void;
        PreSolve(contact: Contacts.b2Contact, oldManifold: Collision.b2Manifold): void;
        PostSolve(contact: Contacts.b2Contact, impulse: b2ContactImpulse): void;
      }

      class b2World {
        constructor(gravity: Common.Math.b2Vec2, doSleep: boolean);
        SetContactFilter(filter: b2ContactFilter | null): void;
        SetContactListener(listener: b2ContactListener | null): void;
        SetGravity(gravity: Common.Math.b2Vec2): void;
        GetGravity(): Common.Math.b2Vec2;
        GetGroundBody(): b2Body;
        CreateBody(def: b2BodyDef): b2Body;
        DestroyBody(body: b2Body): void;
        CreateJoint(def: Joints.b2JointDef): Joints.b2Joint;
        DestroyJoint(joint: Joints.b2Joint): void;
        Step(dt: number, velocityIterations: number, positionIterations: number): void;
        ClearForces(): void;
        IsLocked(): boolean;
        GetBodyList(): b2Body | null;
        GetJointList(): Joints.b2Joint | null;
        QueryAABB(callback: (fixture: b2Fixture) => boolean, aabb: Collision.b2AABB): void;
        RayCast(
          callback: (
            fixture: b2Fixture,
            point: Common.Math.b2Vec2,
            normal: Common.Math.b2Vec2,
            fraction: number,
          ) => number,
          point1: Common.Math.b2Vec2,
          point2: Common.Math.b2Vec2,
        ): void;
        RayCastOne(point1: Common.Math.b2Vec2, point2: Common.Math.b2Vec2): b2Fixture | null;
      }
    }
  }

  export default Box2D;
}
