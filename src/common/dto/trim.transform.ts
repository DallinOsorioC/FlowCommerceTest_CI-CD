import { Transform } from 'class-transformer';

// Quita espacios al inicio y al final ANTES de validar. Así "   " llega como
// "" y @IsNotEmpty() lo rechaza con 400 (C5 en Clients, P3 en Products), en
// vez de guardarse un nombre vacío. Los valores que no son texto pasan tal
// cual para que @IsString() los rechace.
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
