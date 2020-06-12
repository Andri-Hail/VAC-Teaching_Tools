'use strict';

const _ = require('lodash');
const parseKey = require('../util/parse-key');
const where = require('./where');

/**
 * An SQL DML statement.
 *
 * @class
 * @param {Table} source - Database object to query.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Update options}.
 */
const Statement = function (source, options = {}) {
  this.source = source;

  // query and result processing options
  this.build = options.build || false;
  this.decompose = options.decompose;
  this.document = options.document || false;
  this.single = options.single || false;
  this.stream = options.stream || false;

  // common SQL statement modifications
  this.only = options.only || false;
  this.returning = options.fields ? options.fields.map(f => parseKey(f, source).lhs) : ['*'];

  return this;
};

/**
 * Determine whether a criteria object represents a search on the complete
 * primary key and only the primary key.
 *
 * @param {Object} criteria - A criteria object.
 * @return {Boolean} True if the criteria represent a primary key search.
 */
Statement.prototype.isPkSearch = function (criteria) {
  if (!this.source.pk) { return false; }

  const criteriaKeys = _.map(criteria, (v, k) => parseKey(k, this.source).field);

  return _.difference(criteriaKeys, this.source.pk).length === 0;
};

/**
 * Set the conditions and parameters for SELECT, UPDATE, and DELETE queries.
 *
 * @param {Object} criteria - A criteria object.
 * @param {Array} [initialParams] - Existing parameters which will be prepended
 * to parameters generated from criteria.
 */
Statement.prototype.setCriteria = function (criteria, initialParams = []) {
  if (!_.isPlainObject(criteria)) {
    // primitive unary pk search
    if (!this.source.pk) {
      throw new Error(`${this.source.delimitedFullName} doesn't have a primary key.`);
    }

    this.criteria = _.fromPairs([[this.source.pk[0], criteria]]);
    this.single = this.source.loader !== 'join';
  } else {
    this.criteria = criteria;
  }

  const {conditions, params} = where(
    this.source,
    this.criteria,
    initialParams.length,
    // use document mode in the WHERE clause if:
    // * document mode has been selected
    // * we are not searching on the pk, since that's always in the row rather
    // than the document body
    this.document && _.isPlainObject(criteria) && !this.isPkSearch(criteria)
  );

  this.conditions = conditions;
  this.params = initialParams.length ? initialParams.concat(params) : params;
};

module.exports = Statement;
