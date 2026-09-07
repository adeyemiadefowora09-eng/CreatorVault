import { prisma } from "../../config/db.js";
import { ApiError } from "../../utils/apiError.js";
import { hashPassword, comparePassword } from "../../utils/hash.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../../utils/jwt.js";
import { RegisterInput, LoginInput } from "./auth.validation.js";

function stripPassword(user: any) {
  const { passwordHash, ...rest } = user;
  return rest;
}

export async function register(data: RegisterInput) {
  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existing) {
    throw ApiError.conflict("A user with this email already exists");
  }

  const hashed = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash: hashed,
      name: data.name,
      role: data.role,
      ...(data.role === "CREATOR" && {
        creatorProfile: { create: {} },
      }),
      ...(data.role === "BRAND" && {
        brandProfile: { create: {} },
      }),
    },
    include: {
      creatorProfile: true,
      brandProfile: true,
    },
  });

  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: stripPassword(user),
    accessToken,
    refreshToken,
  };
}

export async function login(data: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: {
      creatorProfile: true,
      brandProfile: true,
    },
  });

  if (!user) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const valid = await comparePassword(data.password, user.passwordHash);

  if (!valid) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const payload = { id: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: stripPassword(user),
    accessToken,
    refreshToken,
  };
}

export async function refresh(token: string) {
  const stored = await prisma.refreshToken.findUnique({
    where: { token },
  });

  if (!stored) {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw ApiError.unauthorized("Refresh token has expired");
  }

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    await prisma.refreshToken.delete({ where: { id: stored.id } });
    throw ApiError.unauthorized("Invalid refresh token");
  }

  await prisma.refreshToken.delete({ where: { id: stored.id } });

  const newPayload = { id: payload.id, email: payload.email, role: payload.role };
  const accessToken = generateAccessToken(newPayload);
  const refreshToken = generateRefreshToken(newPayload);

  await prisma.refreshToken.create({
    data: {
      token: refreshToken,
      userId: payload.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export async function logout(userId: string, token: string) {
  await prisma.refreshToken.deleteMany({
    where: { userId, token },
  });
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      creatorProfile: true,
      brandProfile: true,
    },
  });

  if (!user) {
    throw ApiError.notFound("User");
  }

  return stripPassword(user);
}
