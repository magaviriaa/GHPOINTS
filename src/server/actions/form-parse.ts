import { DomainError, ErrorCodes } from "@/server/domain/errors";

export function str(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

export function strs(formData: FormData, name: string): string[] {
  return formData.getAll(name).map(String).filter((item) => item.length > 0);
}

export function num(formData: FormData, name: string): number {
  return Number(formData.get(name) ?? 0);
}

export function parseEnum<T extends string>(value: string, allowed: readonly [T, ...T[]]): T {
  for (const option of allowed) {
    if (option === value) return option;
  }
  throw new DomainError(ErrorCodes.VALIDATION, "Valor inválido.", 400);
}
