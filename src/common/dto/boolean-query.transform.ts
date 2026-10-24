import { Transform } from 'class-transformer';

// Convierte 'true' / 'false' de un query string en booleano.
//
// Se lee el valor CRUDO (obj[key]) a propósito: con enableImplicitConversion la
// conversión implícita haría Boolean('false') === true antes de llegar aquí.
// Cualquier otro valor se deja tal cual para que @IsBoolean() lo rechace con 400.
export const BooleanQuery = (): PropertyDecorator =>
  Transform(({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
    const raw = obj[key];
    if (raw === 'true' || raw === true) return true;
    if (raw === 'false' || raw === false) return false;
    return raw;
  });
