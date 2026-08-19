import { customAlphabet } from "nanoid";

export const createPublicId = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 10);
