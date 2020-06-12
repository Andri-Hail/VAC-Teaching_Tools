'use strict';

const _ = require('lodash');
const quote = require('./quote');

/**
 * Tokenize and analyze a string representing a field in a database
 * relation.
 * @param {String} key - the string to process.
 * @return {Object} A complete manifest of what the key targets and how.
 */
const lex = function (key) {
  key = key.trim();

  const pathShape = [];       // describe path traversal: true is a field, false an array index
  const tokens = [[]];        // we're going to collect token arrays
  let buffer = tokens[0];     // start with the first token
  let inQuotation = false;    // ensure we pick up everything in quotes
  let hasCast = false;        // make sure we pull the appropriate token for cast
  let jsonAsText = false;     // explicit casts must use as-text operators
  let i = 0;
  let char = key.charAt(i);

  do {
    if (inQuotation && char !== '"') {
      buffer.push(char);
    } else {
      switch (char) {
        case '"':
          // quoted field
          if (inQuotation) {
            // closing a quotation completes a token
            buffer = tokens[tokens.push([]) - 1];
          }

          inQuotation = !inQuotation;

          break;

        case ':':
          // cast; new token, but we ignore the : characters since we only care
          // about type
          if (!hasCast) {
            hasCast = true;
            jsonAsText = true; // Explicit casts must use as-text operators

            buffer = tokens[tokens.push([]) - 1];
          }

          break;

        case '.':
          // json path traversal. new token, and note that it's a field to ensure
          // proper element/index handling later.
          pathShape.push(true);
          buffer = tokens[tokens.push([]) - 1];
          break;

        case '[':
          // json array index. new token, and note that it's an index for later.
          pathShape.push(false);
          buffer = tokens[tokens.push([]) - 1];
          break;

        case ']':
          // terminate json array index. starts a new token, no pathShape push
          buffer = tokens[tokens.push([]) - 1];
          break;

        case ' ': case '\t': case '\r': case '\n':
          // whitespace; separates tokens
          buffer = tokens[tokens.push([]) - 1];
          break;

        default:    // eslint-disable-line no-fallthrough
          buffer.push(char);
          break;
      }
    }

    i++;
  } while (char = key.charAt(i)); // eslint-disable-line no-cond-assign

  return {
    pathShape,
    jsonAsText,
    hasCast,
    tokens: tokens.reduce(function (acc, p) {
      const str = p.join('').trim();

      if (str) { acc.push(str); }

      return acc;
    }, [])
  };
};

/**
 * Parse out a criterion key or field reference into something more
 * intelligible. Massive is more flexible than Postgres' query parser, with more
 * alternate aliases for operations and looser rules about quoting, especially
 * with JSON fields. This necessitates some pretty gnarly parsing.
 *
 * @module parseKey
 * @param  {String} key - A reference to a database column. The field name may
 * be quoted using double quotes to allow names which otherwise would not
 * conform with database naming conventions. Optional components include, in
 * order, [] and . notation to describe elements of a JSON field; ::type to
 * describe a cast; and finally, an argument to the appendix function.
 * @param {Entity} source - The relation to which the key refers.
 * @param {Boolean} jsonAsText A boolean to determine which JSON extraction operators to use
 * @return {Object} An object describing the parsed key.
 */
exports = module.exports = function (key, source, jsonAsText = true) {
  const lexed = lex(key);
  const tokens = lexed.tokens;
  const pathShape = lexed.pathShape;
  const hasCast = lexed.hasCast;

  let alias, schema, relation;

  if (source && source.loader === 'join') {
    // Join Readables get some special treatment since keys passed in a join
    // context may have schema and relation information prepended. There are
    // multiple possible cases. In almost all of them, the pathShape will have
    // picked up spurious initial values since schema.relation.field looks a lot
    // like field.jsonobject.property to the lexer, and so these values must be
    // removed before proceeding.

    if (source.name === tokens[0]) {
      // 1. The first token matches the origin relation's name.
      relation = tokens.shift();
      pathShape.shift();
    } else if (source.schema === tokens[0] && source.name === tokens[1]) {
      // 2. The first two tokens match the origin relation's schema and name.
      // This is the only instance in which the schema is retained, since
      // joined relations in schemas other than db.currentSchema are aliased.
      schema = tokens.shift();
      relation = tokens.shift();
      pathShape.splice(0, 2);
    } else {
      // no match to the origin relation, time to look in the joins
      const matched = source.joins.some(j => {
        if (j.alias.indexOf(tokens[0]) > -1) {
          // 3. The first token matches a known alias.
          alias = tokens.shift();
          pathShape.shift();
        } else if (j.relation === tokens[0]) {
          // 4. The first token matches a joined relation's name.
          alias = j.alias;
          relation = tokens.shift();
          pathShape.shift();
        } else if (j.schema === tokens[0] && j.relation === tokens[1]) {
          // 5. The first two tokens match a joined relation's schema and name.
          // In (5), the schema is noted but not included in the path or lhs
          // since the relation is aliased either explicitly in the join
          // definition or implicitly by reduction to the relation name.
          alias = j.alias;
          schema = tokens.shift();
          relation = tokens.shift();
          pathShape.splice(0, 2);
        } else {
          return false;
        }

        return true;
      });

      if (!matched) {
        // 6. No tokens match any member relation. Assume it references the
        // origin.
        schema = source.schema;
        relation = source.name;
      }
    }
  }

  const field = tokens.shift();
  const pathElements = _.compact([
    // aliases may not include schemas
    !!alias || schema === source.db.currentSchema ? undefined : schema,
    alias || relation,
    field
  ]);
  const path = pathElements.map(quote).join('.');
  let lhs = path;
  let jsonElements;

  if (pathShape.length === 1) {
    const operator = lexed.jsonAsText || jsonAsText ? '->>' : '->';

    jsonElements = [tokens.shift()];

    if (pathShape[0]) {
      // object keys must be quoted
      lhs = `${path}${operator}'${jsonElements[0]}'`;
    } else {
      // array index
      lhs = `${path}${operator}${jsonElements[0]}`;
    }
  } else if (pathShape.length > 0) {
    const operator = jsonAsText ? '#>>' : '#>';

    jsonElements = tokens.splice(0, pathShape.length);

    lhs = `${path}${operator}'{${jsonElements.join(',')}}'`;
  }

  let cast;

  if (hasCast) {
    cast = tokens.shift();

    // parens are only needed for JSON pathing
    lhs = pathShape.length > 0 ? `(${lhs})::${cast}` : `${lhs}::${cast}`;
  }

  return {
    schema,
    relation: relation || alias || (source ? source.name : undefined),
    field,
    pathElements,
    path,
    lhs,
    jsonElements: jsonElements || [],
    remainder: tokens.length > 0 ? tokens.join(' ').toLowerCase() : undefined,
    isJSON: pathShape.length > 0
  };
};

exports.lex = lex;

/**
 * Parse the provided key into a predicate by finding or assigning an operation
 * and attaching the right-hand side value.
 *
 * @param  {String} key - A reference to a database column. The field name may
 * be quoted using double quotes to allow names which otherwise would not
 * conform with database naming conventions. Optional components include, in
 * order, [] and . notation to describe elements of a JSON field; ::type to
 * describe a cast; and finally, an argument to the appendix function.
 * @param {Entity} source - The relation to which the key refers.
 * @param {Function} appendix - A function which returns (currently) an
 * operation definition corresponding to the remaining part of key after all
 * other elements have been processed.
 * @param {Object} value - The right-hand side value to attach to the
 * predicate.
 * @param {Integer} offset - The offset to apply to the predicate for prepared
 * statement parameter indexing.
 * @return {Object} A predicate object extending the base output of parseKey
 * itself, supplemented with appended and right-hand side properties.
 */
exports.withAppendix = function (key, source, appendix, value, offset) {
  const predicate = this(key, source);

  predicate.offset = offset;
  predicate.value = value;
  predicate.params = [];

  let appended = predicate.remainder && appendix(predicate.remainder);

  if (!appended) {
    appended = appendix('=');
  }

  predicate.appended = appended;

  return predicate;
};
