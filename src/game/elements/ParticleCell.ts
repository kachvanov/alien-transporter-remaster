// Port of ru/alientransporter/elements/ParticleCell.as

import type { Particle } from './Particle';

export class ParticleCell {
  particles: (Particle | null)[] | null;
  numParticles: number; // :int

  constructor() {
    // super();
    this.particles = [];
    this.numParticles = 0;
  }

  destroy(): void {
    (this.particles as (Particle | null)[]).length = 0;
    this.particles = null;
    this.numParticles = 0;
  }

  addParticle(aParticle: Particle): void {
    const particles = this.particles as (Particle | null)[];
    const index = particles.indexOf(aParticle) | 0; // :int
    if (index == -1) {
      particles[this.numParticles++] = aParticle;
    }
  }

  removeParticle(aParticle: Particle): void {
    const particles = this.particles as (Particle | null)[];
    const index = particles.indexOf(aParticle) | 0; // :int
    if (index >= 0 && index < this.numParticles) {
      particles[index] = null;
      particles.splice(index, 1);
      --this.numParticles;
    }
  }
}
