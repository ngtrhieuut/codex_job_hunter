import { safeUrl } from './normalize';
import type {
  CsvParseOptions,
  CsvParseResult,
  ImportResult,
  ImportValidationError,
  JsonObject,
  RawOpportunityRecord,
} from './types';

type UnknownRecord = Record<string, unknown>;

const LIST_FIELDS = new Set([
  'categories',
  'category',
  'technologies',
  'techStack',
  'tech_stack',
  'deliverables',
  'acceptanceCriteria',
  'acceptance_criteria',
  'inferredAcceptanceCriteria',
  'inferred_acceptance_criteria',
  'missingInformation',
  'missing_information',
  'clientConstraints',
  'client_constraints',
]);

const JSON_OBJECT_FIELDS = new Set(['metadata', 'rawMetadata', 'raw_metadata', 'budget']);

const CSV_FIELD_ALIASES: Readonly<Record<string, string>> = {
  external_id: 'externalId',
  source_url: 'sourceUrl',
  original_description: 'description',
  normalized_summary: 'summary',
  budget_min: 'budgetMin',
  budget_max: 'budgetMax',
  budget_midpoint: 'budgetMidpoint',
  budget_type: 'budgetType',
  tech_stack: 'technologies',
  acceptance_criteria: 'acceptanceCriteria',
  inferred_acceptance_criteria: 'acceptanceCriteria',
  missing_information: 'missingInformation',
  client_constraints: 'clientConstraints',
  explicit_deadline: 'explicitDeadline',
  posted_at: 'postedAt',
  discovered_at: 'discoveredAt',
  raw_metadata: 'metadata',
  html_url: 'sourceUrl',
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function error(
  code: ImportValidationError['code'],
  row: number | null,
  path: string,
  message: string,
  value?: unknown,
): ImportValidationError {
  return { code, row, path, message, ...(value === undefined ? {} : { value }) };
}

function hasAnyContent(values: readonly string[]): boolean {
  return values.some((value) => value.length > 0);
}

/**
 * RFC-4180-style CSV parser with strict quoting and field-count validation.
 * It only produces data; it never evaluates cells as code or expressions.
 */
export function parseCsv(input: string, options: CsvParseOptions = {}): CsvParseResult {
  const delimiter = options.delimiter ?? ',';
  const errors: ImportValidationError[] = [];
  if (typeof input !== 'string' || input.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: [error('EMPTY_INPUT', null, '$', 'CSV input is empty.')],
    };
  }
  if (delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    return {
      headers: [],
      rows: [],
      errors: [
        error(
          'INVALID_CSV',
          null,
          '$',
          'CSV delimiter must be one character and cannot be quote/newline.',
        ),
      ],
    };
  }

  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const parsedRows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoteClosed = false;
  let physicalLine = 1;
  let rowStartLine = 1;

  const finishRow = (): void => {
    row.push(field);
    field = '';
    quoteClosed = false;
    parsedRows.push(row);
    row = [];
    rowStartLine = physicalLine;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        field += character;
        if (character === '\n') physicalLine += 1;
      }
      continue;
    }

    if (quoteClosed) {
      if (character === delimiter) {
        row.push(field);
        field = '';
        quoteClosed = false;
      } else if (character === '\r' || character === '\n') {
        finishRow();
        if (character === '\r' && source[index + 1] === '\n') index += 1;
        physicalLine += 1;
      } else {
        errors.push(
          error('INVALID_CSV', rowStartLine, '$', 'Unexpected characters after a closing quote.'),
        );
        field += character;
        quoteClosed = false;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0) {
        errors.push(
          error('INVALID_CSV', rowStartLine, '$', 'A quote may only start a quoted field.'),
        );
        field += character;
      } else {
        inQuotes = true;
      }
    } else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\r' || character === '\n') {
      finishRow();
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      physicalLine += 1;
    } else {
      field += character;
    }
  }

  if (inQuotes) {
    errors.push(error('INVALID_CSV', rowStartLine, '$', 'Unclosed quoted field.'));
  }
  if (row.length > 0 || field.length > 0 || quoteClosed) {
    finishRow();
  }
  if (!parsedRows.length) {
    return {
      headers: [],
      rows: [],
      errors: [...errors, error('EMPTY_INPUT', null, '$', 'CSV input contains no rows.')],
    };
  }

  const headers = parsedRows[0].map((header) => header.trim());
  const headerKeys = new Set<string>();
  headers.forEach((header, index) => {
    if (!header) {
      errors.push(error('EMPTY_HEADER', 1, `headers[${index}]`, 'CSV header cannot be empty.'));
    }
    const key = header.toLocaleLowerCase();
    if (key && headerKeys.has(key)) {
      errors.push(
        error('DUPLICATE_HEADER', 1, `headers[${index}]`, `Duplicate CSV header: ${header}.`),
      );
    }
    if (key) headerKeys.add(key);
  });
  for (const required of options.requiredHeaders ?? []) {
    const canonicalRequired = required.toLocaleLowerCase();
    if (!headerKeys.has(canonicalRequired)) {
      errors.push(
        error('MISSING_HEADER', 1, 'headers', `Required CSV header is missing: ${required}.`),
      );
    }
  }

  const rows: Record<string, string>[] = [];
  for (let index = 1; index < parsedRows.length; index += 1) {
    const values = parsedRows[index];
    const rowNumber = index + 1;
    if (!hasAnyContent(values)) {
      if (!options.allowBlankLines) {
        errors.push(
          error('EMPTY_ROW', rowNumber, `rows[${index - 1}]`, 'Blank CSV rows are not allowed.'),
        );
      }
      continue;
    }
    if (values.length !== headers.length) {
      errors.push(
        error(
          'ROW_FIELD_COUNT',
          rowNumber,
          `rows[${index - 1}]`,
          `Expected ${headers.length} fields but found ${values.length}.`,
        ),
      );
      continue;
    }
    const record: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      if (header) record[header] = values[headerIndex];
    });
    rows.push(record);
  }

  return { headers, rows, errors };
}

function dangerousKey(key: string): boolean {
  return key === '__proto__' || key === 'prototype' || key === 'constructor';
}

function assertJsonContainer(value: unknown, path: string, errors: ImportValidationError[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonContainer(item, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, item] of Object.entries(value)) {
    if (dangerousKey(key)) {
      errors.push(
        error('INVALID_OBJECT', null, `${path}.${key}`, 'Dangerous object key is not accepted.'),
      );
    }
    assertJsonContainer(item, `${path}.${key}`, errors);
  }
}

function parseJsonRoot(input: string | unknown): unknown {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input) as unknown;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Invalid JSON';
    throw new ImportValidationException([
      error('INVALID_JSON', null, '$', `Invalid JSON: ${message}.`),
    ]);
  }
}

export class ImportValidationException extends Error {
  readonly errors: readonly ImportValidationError[];

  constructor(errors: readonly ImportValidationError[]) {
    super(
      errors.map((item) => `${item.path}: ${item.message}`).join('; ') ||
        'Import validation failed.',
    );
    this.name = 'ImportValidationException';
    this.errors = [...errors];
  }
}

/** Parses a JSON object or an array of JSON objects, rejecting scalar roots. */
export function parseJsonArrayOrObject(input: string | unknown): JsonObject | JsonObject[] {
  const parsed = parseJsonRoot(input);
  const errors: ImportValidationError[] = [];
  assertJsonContainer(parsed, '$', errors);
  if (errors.length) throw new ImportValidationException(errors);
  if (Array.isArray(parsed)) {
    if (!parsed.every(isRecord)) {
      throw new ImportValidationException([
        error('INVALID_RECORD', null, '$', 'JSON arrays must contain only objects.'),
      ]);
    }
    return parsed as JsonObject[];
  }
  if (isRecord(parsed)) return parsed as JsonObject;
  throw new ImportValidationException([
    error('INVALID_OBJECT', null, '$', 'JSON root must be an object or an array of objects.'),
  ]);
}

function canonicalCsvField(header: string): string {
  const trimmed = header.trim();
  return CSV_FIELD_ALIASES[trimmed.toLocaleLowerCase()] ?? trimmed;
}

function parseListCell(
  value: string,
  row: number,
  path: string,
  errors: ImportValidationError[],
): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = parseJsonArrayOrObject(trimmed);
      if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
        errors.push(
          error(
            'INVALID_ARRAY',
            row,
            path,
            'CSV list fields must contain a JSON array of strings.',
            value,
          ),
        );
        return undefined;
      }
      return parsed as string[];
    } catch (cause) {
      const validation = cause instanceof ImportValidationException ? cause.errors : [];
      errors.push(
        ...(validation.length
          ? validation.map((item) => ({ ...item, code: 'INVALID_JSON_FIELD' as const, row, path }))
          : [error('INVALID_JSON_FIELD', row, path, 'Invalid JSON array in CSV field.', value)]),
      );
      return undefined;
    }
  }
  return trimmed
    .split(/[;,\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseObjectCell(
  value: string,
  row: number,
  path: string,
  errors: ImportValidationError[],
): JsonObject | undefined {
  if (!value.trim()) return {};
  try {
    const parsed = parseJsonArrayOrObject(value.trim());
    if (Array.isArray(parsed)) {
      errors.push(
        error('INVALID_OBJECT', row, path, 'CSV object fields must contain a JSON object.', value),
      );
      return undefined;
    }
    return parsed;
  } catch {
    errors.push(error('INVALID_JSON_FIELD', row, path, 'Invalid JSON object in CSV field.', value));
    return undefined;
  }
}

function csvRecordToRaw(
  row: Record<string, string>,
  rowNumber: number,
  errors: ImportValidationError[],
): RawOpportunityRecord {
  const output: UnknownRecord = {};
  for (const [header, value] of Object.entries(row)) {
    const key = canonicalCsvField(header);
    if (LIST_FIELDS.has(key)) {
      const parsed = parseListCell(value, rowNumber, key, errors);
      if (parsed !== undefined) output[key] = parsed;
    } else if (JSON_OBJECT_FIELDS.has(key)) {
      const parsed = parseObjectCell(value, rowNumber, key, errors);
      if (parsed !== undefined) output[key] = parsed;
    } else {
      output[key] = value;
    }
  }
  return output as RawOpportunityRecord;
}

function fieldValue(
  record: UnknownRecord,
  aliases: readonly string[],
): { key: string; value: unknown } | null {
  for (const key of aliases) {
    if (Object.prototype.hasOwnProperty.call(record, key)) return { key, value: record[key] };
  }
  return null;
}

function nonEmptyString(value: unknown): boolean {
  return typeof value === 'string'
    ? value.trim().length > 0
    : typeof value === 'number' || typeof value === 'boolean';
}

function validNonNegativeNumber(value: unknown): 'ok' | 'invalid' | 'negative' {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'invalid';
    return value < 0 ? 'negative' : 'ok';
  }
  if (typeof value === 'string') {
    const text = value.trim().replace(/[$€£₫,\s]/g, '');
    if (!text) return 'invalid';
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return 'invalid';
    return parsed < 0 ? 'negative' : 'ok';
  }
  return 'invalid';
}

function validateRecord(
  record: unknown,
  index: number,
  requireDescription: boolean,
): { record?: RawOpportunityRecord; errors: ImportValidationError[] } {
  const row = index + 1;
  const errors: ImportValidationError[] = [];
  if (!isRecord(record)) {
    return {
      errors: [
        error(
          'INVALID_RECORD',
          row,
          `records[${index}]`,
          'Each opportunity must be an object.',
          record,
        ),
      ],
    };
  }
  const title = fieldValue(record, ['title', 'name']);
  if (!title || !nonEmptyString(title.value)) {
    errors.push(
      error(
        'REQUIRED_FIELD',
        row,
        `records[${index}].title`,
        'title is required and must be non-empty.',
      ),
    );
  }
  const description = fieldValue(record, [
    'description',
    'originalDescription',
    'original_description',
    'body',
  ]);
  if (requireDescription && (!description || !nonEmptyString(description.value))) {
    errors.push(
      error(
        'REQUIRED_FIELD',
        row,
        `records[${index}].description`,
        'description is required and must be non-empty.',
      ),
    );
  }

  for (const item of [
    fieldValue(record, ['source']),
    fieldValue(record, ['externalId', 'external_id']),
    fieldValue(record, ['currency']),
  ]) {
    if (item && item.value !== undefined && item.value !== null && typeof item.value !== 'string') {
      errors.push(
        error(
          'INVALID_FIELD_TYPE',
          row,
          `records[${index}].${item.key}`,
          'Field must be a string.',
          item.value,
        ),
      );
    }
  }

  const url = fieldValue(record, ['sourceUrl', 'source_url', 'url', 'html_url']);
  if (
    url &&
    url.value !== undefined &&
    url.value !== null &&
    url.value !== '' &&
    !safeUrl(url.value)
  ) {
    errors.push(
      error(
        'INVALID_URL',
        row,
        `records[${index}].${url.key}`,
        'URL must be a valid HTTP(S) URL without credentials.',
        url.value,
      ),
    );
  }

  for (const field of [
    'budgetMin',
    'budget_min',
    'budgetMax',
    'budget_max',
    'budgetMidpoint',
    'budget_midpoint',
  ]) {
    if (!Object.prototype.hasOwnProperty.call(record, field) || record[field] === '') continue;
    const result = validNonNegativeNumber(record[field]);
    if (result === 'invalid')
      errors.push(
        error(
          'INVALID_NUMBER',
          row,
          `records[${index}].${field}`,
          'Budget must be a non-negative number.',
          record[field],
        ),
      );
    if (result === 'negative')
      errors.push(
        error(
          'NEGATIVE_NUMBER',
          row,
          `records[${index}].${field}`,
          'Budget cannot be negative.',
          record[field],
        ),
      );
  }

  for (const field of LIST_FIELDS) {
    if (
      !Object.prototype.hasOwnProperty.call(record, field) ||
      record[field] === undefined ||
      record[field] === null ||
      record[field] === ''
    )
      continue;
    const value = record[field];
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      errors.push(
        error(
          'INVALID_ARRAY',
          row,
          `records[${index}].${field}`,
          'Field must be an array of strings.',
          value,
        ),
      );
    }
  }

  for (const field of JSON_OBJECT_FIELDS) {
    if (
      !Object.prototype.hasOwnProperty.call(record, field) ||
      record[field] === undefined ||
      record[field] === null ||
      record[field] === ''
    )
      continue;
    if (!isRecord(record[field])) {
      errors.push(
        error(
          'INVALID_OBJECT',
          row,
          `records[${index}].${field}`,
          'Field must be a JSON object.',
          record[field],
        ),
      );
    }
  }
  return errors.length ? { errors } : { record: record as RawOpportunityRecord, errors };
}

export function validateOpportunityRecords(
  records: readonly unknown[],
  options: { requireDescription?: boolean } = {},
): ImportResult<RawOpportunityRecord> {
  const validRecords: RawOpportunityRecord[] = [];
  const errors: ImportValidationError[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const validated = validateRecord(records[index], index, options.requireDescription ?? false);
    errors.push(...validated.errors);
    if (validated.record) validRecords.push(validated.record);
  }
  return { format: 'json', records: validRecords, errors, valid: errors.length === 0 };
}

export function importOpportunityCsv(
  input: string,
  options: CsvParseOptions & { requireDescription?: boolean } = {},
): ImportResult<RawOpportunityRecord> {
  const parsed = parseCsv(input, {
    ...options,
    requiredHeaders: options.requiredHeaders ?? ['title'],
  });
  const conversionErrors: ImportValidationError[] = [];
  const records = parsed.rows.map((row, index) => csvRecordToRaw(row, index + 2, conversionErrors));
  const validated = validateOpportunityRecords(records, {
    requireDescription: options.requireDescription,
  });
  const errors = [...parsed.errors, ...conversionErrors, ...validated.errors];
  return {
    format: 'csv',
    records: errors.length ? validated.records : validated.records,
    errors,
    valid: errors.length === 0,
  };
}

function jsonOpportunityRecords(root: JsonObject | JsonObject[]): unknown[] {
  if (Array.isArray(root)) return root;
  const envelope = root.opportunities ?? root.data ?? root.records;
  return Array.isArray(envelope) ? envelope : [root];
}

export function importOpportunityJson(
  input: string | unknown,
  options: { requireDescription?: boolean } = {},
): ImportResult<RawOpportunityRecord> {
  try {
    const root = parseJsonArrayOrObject(input);
    const validated = validateOpportunityRecords(jsonOpportunityRecords(root), options);
    return { ...validated, format: 'json' };
  } catch (cause) {
    const errors =
      cause instanceof ImportValidationException
        ? [...cause.errors]
        : [error('INVALID_JSON', null, '$', 'Invalid JSON import.')];
    return { format: 'json', records: [], errors, valid: false };
  }
}

export function importOpportunities(
  input: string,
  options: { format?: 'csv' | 'json'; requireDescription?: boolean } = {},
): ImportResult<RawOpportunityRecord> {
  const format =
    options.format ??
    (input.trimStart().startsWith('[') || input.trimStart().startsWith('{') ? 'json' : 'csv');
  return format === 'json'
    ? importOpportunityJson(input, { requireDescription: options.requireDescription })
    : importOpportunityCsv(input, { requireDescription: options.requireDescription });
}

export const parseOpportunityCsv = importOpportunityCsv;
export const parseOpportunityJson = importOpportunityJson;
