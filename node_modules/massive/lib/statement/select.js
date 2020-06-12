'use strict';

const _ = require('lodash');
const parseKey = require('../util/parse-key');
const Statement = require('./statement');

/**
 * Represents a SELECT query.
 *
 * @class
 * @param {Readable} source - Database object to query.
 * @param {Object|String|UUID|Number} [criteria] - A criteria object, prebuilt
 * predicate, or primitive pk value.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Select options}.
 */
const Select = function (source, criteria = {}, options = {}) {
  Statement.call(this, source, options);

  this.setCriteria(criteria);

  // options governing SQL statement elements, in rough order of appearance:
  this.distinct = options.distinct || false;
  this.selectList = this.buildSelectList(options.fields, options.exprs);
  this.order = _.reduce(options.order, (acc, val) => {
    const direction = val.direction && val.direction.toLowerCase() === 'desc' ? ' DESC' : ' ASC';
    const nulls = val.nulls ? ` NULLS ${val.nulls === 'first' ? 'FIRST' : 'LAST'}` : '';

    acc.push(this.buildOrderExpression(val, options.orderBody) + direction + nulls);

    return acc;
  }, []);
  this.offset = options.offset;
  this.limit = options.limit;
  this.pageLength = options.pageLength;
  this.lock = this.parseLock(options);

  // with pageLength set for keyset pagination, add last values of ordering
  // fields to criteria
  if (this.pageLength) {
    if (!options.order) {
      throw new Error('Keyset paging with pageLength requires an explicit order directive');
    } else if (
      Object.prototype.hasOwnProperty.call(options, 'offset') ||
      Object.prototype.hasOwnProperty.call(options, 'limit')
    ) {
      throw new Error('Keyset paging cannot be used with offset and limit');
    } else if (Object.hasOwnProperty.call(options.order[0], 'last')) {
      const paginationColumns = options.order.map(o => this.buildOrderExpression(o)).join(',');
      const placeholders = options.order.map((o, idx) => `$${idx + this.params.length + 1}`).join(',');
      const comparison = options.order[0].direction && options.order[0].direction.toLowerCase() === 'desc' ? '<' : '>';

      this.params = this.params.concat(options.order.map(o => o.last));
      this.pagination = `(${paginationColumns}) ${comparison} (${placeholders})`;
    }
  }
};

Select.prototype = Object.create(Statement.prototype);

/**
 * Build a list of strings comprising fields (plus aliases, for document
 * tables and joined or compound Readables) and expressions to be retrieved
 * from the source Readable.
 *
 * @param {Array} fields - A list of field names.
 * @param {Object} exprs - A map of expression aliases to values. Values are
 * interpolated directly into the SQL emitted and are thus a potential vector
 * for SQL injection attacks if used carelessly.
 * @return {Array} The complete array of select expressions.
 */
Select.prototype.buildSelectList = function (fields, exprs) {
  const selectList = _.castArray(fields || []).reduceRight((all, field) => {
    if (this.document) {
      // document fields need to alias a JSON traversal expression
      const documentField = `body.${field}`;

      all.unshift(`${parseKey(documentField, this.source).lhs} AS "${field}"`);
    } else {
      all.unshift(parseKey(field, this.source).lhs);
    }

    return all;
  }, _.map(exprs || {}, (expr, name) => {
    // interpolate unsafe user-defined expressions
    return `${expr} AS "${name}"`;
  }));

  if (!selectList.length) {
    if (!fields && !exprs) {
      // nothing specified, select all
      if (this.source.loader === 'join') {
        return this.source.columns.map(c => `${c.fullName} AS "${c.alias}"`);
      }

      return ['*'];
    }

    // we got nothing *explicitly*, error state
    throw new Error('At least one of fields or exprs must be supplied and must define a field or expression to select.');
  } else if (this.document && fields) {
    // if we're querying fields on a document table, the id must always be
    // included. Expressions always need to be fully qualified, so expression-
    // only queries (e.g. countDoc) aren't affected here.
    selectList.unshift('"id"');
  }

  return selectList;
};

/**
 * Build a single expression for an ORDER BY list.
 *
 * @param {Object} orderObj - An object representing an ORDER BY list element.
 * @param {String} [orderObj.field] - The name of a field in the target
 * relation. May include JSON traversal or an implicit cast in the Postgres
 * 'x::y' format. Either field or expr must be supplied.
 * @param {String} [orderObj.expr] - An expression to be interpolated into the
 * ORDER BY clause directly.
 * @param {String} [orderObj.direction] - "ASC" or "DESC"; not used here, but
 * included for completeness.
 * @param {String} [orderObj.type] - An explicit cast type. If specified for a
 * JSON traversal expression, the value will be retrieved as text before it is
 * cast to the target type.
 * @param {Boolean} useBody - True to treat orderObj.field as an element in the
 * document body instead of a column on the target relation.
 * @return {String} A single expression to be included in an ORDER BY clause.
 */
Select.prototype.buildOrderExpression = function (orderObj, useBody = false) {
  const jsonAsText = !!orderObj.type; // Explicit casts must use as-text operators
  let field;

  if (orderObj.expr) {
    field = orderObj.expr;
  } else if (useBody) {
    field = `"body"${jsonAsText ? '->>' : '->'}'${orderObj.field}'`;
  } else if (orderObj.field) {
    field = parseKey(orderObj.field, this.source, jsonAsText).lhs;
  } else {
    throw new Error('Missing order field or expr.');
  }

  if (orderObj.type) {
    return `(${field})::${orderObj.type}`;
  }

  return field;
};

/**
 * Parse a query explicit locking options, supporting legacy `forUpdate` and `forShare`
 * and `forShare` arguments
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Select options}
 * @return {Object} a lock object
 */
Select.prototype.parseLock = function (options) {
  // TODO remove forUpdate and forShare in v7
  const {forUpdate, forShare, lock} = options;

  // fail if more than one of those options is not null and not undefined
  if ([forShare, forUpdate, lock].filter((x) => x != null).length > 1) {
    throw new Error('The "forUpdate", "forShare", and "lock" options are mutually exclusive');
  }

  if (forUpdate !== undefined || forShare !== undefined && process.env.NODE_ENV !== 'production') {
    /* eslint-disable-next-line no-console */
    console.log('DEPRECATED: the "forShare" and "forUpdate" options are deprecated and will be removed in a future version. Use "lock" instead.');
  }

  if (forUpdate) {
    return {strength: 'UPDATE'};
  }

  if (forShare) {
    return {strength: 'SHARE'};
  }

  return options.lock;
};

/**
 * Format this object into a SQL SELECT.
 *
 * @return {String} A SQL SELECT statement.
 */
Select.prototype.format = function () {
  let sql = 'SELECT ';

  if (this.distinct) { sql += 'DISTINCT '; }

  sql += `${this.selectList.join(',')} FROM `;

  if (this.only) { sql += 'ONLY '; }

  sql += `${this.source.delimitedFullName} `;

  if (this.source.loader === 'join') {
    sql += this.source.joins.map(j => `${j.type} JOIN ${j.target} ON ${j.on} `).join('');
  }

  sql += `WHERE ${this.conditions}`;

  if (this.pagination) { sql += ` AND ${this.pagination}`; }
  if (this.order.length) { sql += ` ORDER BY ${this.order.join(',')}`; }
  if (this.lock) { sql += ` FOR ${this.lock.strength}`; }
  if (this.lock && this.lock.lockedRows) { sql += ` ${this.lock.lockedRows}`; }
  if (this.pageLength) { sql += ` FETCH FIRST ${this.pageLength} ROWS ONLY`; }
  if (this.offset) { sql += ` OFFSET ${this.offset}`; }
  if (this.single) {
    sql += ' LIMIT 1';
  } else if (this.limit) {
    sql += ` LIMIT ${this.limit}`;
  }

  return sql;
};

module.exports = Select;
