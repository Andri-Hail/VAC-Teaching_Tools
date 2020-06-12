'use strict';

const _ = require('lodash');
const prepareParams = require('../util/prepare-params');
const quote = require('../util/quote');
const Statement = require('./statement');

/**
 * Represents an INSERT query.
 *
 * @class
 * @param {Table} source - Database object to query.
 * @param {Object|Array} record - A map of field names to values to be inserted,
 * or an array of same.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Insert options}.
 */
const Insert = function (source, record, options = {}) {
  Statement.call(this, source, options);

  this.records = _.castArray(record);

  const fields = this.compileFieldSet(this.records);

  this.single = !_.isArray(record);

  // options governing SQL statement elements, in rough order of appearance:
  this.columns = _.intersection(fields, this.source.columnNames);
  this.junctions = _.difference(fields, this.source.columnNames);
  this.onConflict = this.parseOnConflict(options);

  if ((this.source.loader === 'join' || options.deepInsert) && this.junctions.length) {
    if (this.records.length > 1) {
      throw new Error('Multi-table or deep insert is only supported for single records.');
    }

    // append all junction params (that aren't stubbing out the foreign keys)
    // to the insert's parameter list
    // TODO generate junction field set to allow more flexibility between
    // junction records for the same relationship
    this.params = _.reduce(this.junctions, (allParams, j) => {
      const junction = this.records[0][j];
      const junctionParams = prepareParams(Object.keys(junction[0]), junction);

      return allParams.concat(junctionParams.filter(v => v !== undefined));
    }, prepareParams(this.columns, this.records));
  } else {
    this.params = prepareParams(this.columns, this.records);

    delete this.junctions;
  }
};

Insert.prototype = Object.create(Statement.prototype);

Insert.prototype.parseOnConflict = function (options) {
  const {onConflictIgnore, onConflictUpdate, onConflictUpdateExclude, onConflict} = options;

  // fail if more than one of those options is not null and not undefined
  if ([onConflictIgnore, onConflictUpdate, onConflict].filter((x) => x != null).length > 1) {
    throw new Error('The "onConflictIgnore", "onConflictUpdate", and "onConflict" options are mutually exclusive');
  }

  if (onConflictIgnore) {
    return {action: 'ignore'};
  }

  if (onConflictUpdate) {
    return {
      action: 'update',
      target: onConflictUpdate,
      exclude: onConflictUpdateExclude
    };
  }

  return options.onConflict;
};

/**
 * Build the set of unique column names being targeted across all records.
 *
 * @param {Array} records - A list of record objects.
 * @return {Set} The set of unique columns.
 */
Insert.prototype.compileFieldSet = function (records) {
  return [..._.reduce(records, (set, r) => {
    _.forEach(_.keys(r), set.add.bind(set));

    return set;
  }, new Set())];
};

/**
 * Format this object into a SQL INSERT.
 *
 * @return {String} A SQL INSERT statement.
 */
Insert.prototype.format = function () {
  let offset = 1;
  const quotedColumns = this.columns.map(quote);
  const values = this.records.reduce((acc) => {
    const placeholders = _.range(offset, offset + this.columns.length).map(n => `$${n}`);

    acc.push(`(${placeholders.join(', ')})`);

    offset += this.columns.length;

    return acc;
  }, []).join(', ');

  let sql = `INSERT INTO ${this.source.delimitedFullName} (${quotedColumns.join(', ')}) VALUES ${values} `;

  if (!_.isEmpty(this.onConflict)) {
    if (!this.onConflict.action) {
      throw new Error('onConflict must specify an action of ignore or update');
    }

    const conflictTarget = this.onConflict.target ? `(${_.castArray(this.onConflict.target).map(quote).join(', ')}) ` : '';
    const conflictExpr = this.onConflict.targetExpr ? `(${this.onConflict.targetExpr})` : '';

    sql += `ON CONFLICT ${conflictTarget || conflictExpr}`;

    switch (this.onConflict.action.toLowerCase()) {
      case 'ignore': sql += 'DO NOTHING '; break;
      case 'update': {
        const excludedFieldsArray = (this.onConflict.exclude || []).concat(this.onConflict.target);
        const fieldsToUpdate = _.difference(this.columns, excludedFieldsArray).map(f => `"${f}" = EXCLUDED."${f}"`);

        sql += `DO UPDATE SET ${fieldsToUpdate.join(', ')} `;

        break;
      }
    }
  }

  sql += `RETURNING ${this.returning.join(', ')}`;

  if (this.junctions) {
    const sourcePkList = `"${this.source.pk.join('", "')}"`;
    const junctionQueries = _.reduce(this.junctions, (queries, j, idx) => {
      if (!Array.isArray(this.records[0][j])) {
        throw new Error('Dependent records in a deep or multi-table insert must be supplied as arrays.');
      }

      const jTable = j.split('.').map(quote).join('.');

      return queries.concat(this.records[0][j].map((r, jdx) => {
        // separate out keyColumns so they are consistently positioned in the
        // CTE, since they won't necessarily be ordered in the source map
        const keyColumns = [];
        const valColumns = [];

        _.keys(r).forEach(k => {
          if (r[k] === undefined) {
            keyColumns.push(k);
          } else {
            valColumns.push(k);
          }
        });

        const allQuotedColumns = keyColumns.concat(valColumns).map(quote);
        const rValues = _.range(offset, offset + valColumns.length).map(n => `$${n}`);

        offset += valColumns.length;

        return `q_${idx}_${jdx} AS (INSERT INTO ${jTable} (${allQuotedColumns.join(', ')}) SELECT ${sourcePkList}, ${rValues.join(', ')} FROM inserted)`;
      }));
    }, []);

    sql = `WITH inserted AS (${sql}), ${junctionQueries.join(', ')} SELECT * FROM inserted`;
  }

  return sql;
};

module.exports = Insert;
