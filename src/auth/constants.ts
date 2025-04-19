// src/auth/constants.ts
const secret = 'dd3fece10d030c564ea93bed806466ff174e58c5a1e1febbaf65d74545d261cbddac07a07b8a9f7d0a31c1618760d1f23abc0f9706ffdc58a87747ff6b2bce2e';

if (!secret || secret.length < 64) {
  throw new Error('Invalid JWT secret configuration');
}

export const jwtConstants = {
  secret: secret
};