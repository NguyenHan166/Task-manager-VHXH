import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

const BCRYPT_MAX_INPUT_BYTES = 72;

@ValidatorConstraint({ name: 'maxBcryptPasswordBytes', async: false })
class MaxBcryptPasswordBytesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return (
      typeof value === 'string' &&
      Buffer.byteLength(value, 'utf8') <= BCRYPT_MAX_INPUT_BYTES
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must not exceed ${BCRYPT_MAX_INPUT_BYTES} UTF-8 bytes`;
  }
}

export function MaxBcryptPasswordBytes(
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      target: target.constructor,
      propertyName: propertyName.toString(),
      options,
      validator: MaxBcryptPasswordBytesConstraint,
    });
  };
}
