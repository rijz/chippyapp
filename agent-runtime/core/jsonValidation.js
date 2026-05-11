import Ajv from 'ajv';

export function createAjv() {
  return new Ajv({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
  });
}

export function formatValidationErrors(errors = []) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'unknown validation error';
  }

  return errors
    .map((error) => {
      const path = error.instancePath || '/';
      return `${path} ${error.message}`.trim();
    })
    .join('; ');
}

export function validateOrThrow(validateFn, data, contextLabel) {
  const valid = validateFn(data);
  if (!valid) {
    const details = formatValidationErrors(validateFn.errors || []);
    throw new Error(`${contextLabel} validation failed: ${details}`);
  }
}
