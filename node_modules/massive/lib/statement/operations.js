'use strict';

/** @module operations */

const _ = require('lodash');

const castTimestamp = (value) => {
  if (_.isDate(value)) {
    return '::timestamptz';
  }

  return '';
};

/**
 * Build a BETWEEN (a, b) predicate.
 *
 * @param {Object} condition - A condition object from {@link module:where~getCondition}.
 * @return {Object} The modified condition.
 */
const buildBetween = condition => {
  condition.params = condition.value;
  condition.value = `$${condition.offset}${castTimestamp(condition.value[0])} AND $${condition.offset + 1}${castTimestamp(condition.value[1])}`;
  condition.offset += 2;

  return condition;
};

/**
 * Build an IN (x, y, z) predicate.
 *
 * @param {Object} condition - A condition object from {@link module:where~getCondition}.
 * @return {Object} The modified condition.
 */
const buildIn = condition => {
  if (condition.value.length === 0) {
    condition.value = condition.appended.operator === '=' ? `ANY ('{}')` : `ALL ('{}')`;

    return condition;
  }

  condition.appended.operator = condition.appended.operator === '=' ? 'IN' : 'NOT IN';

  const inList = _.reduce(condition.value, (list, v) => {
    condition.params.push(v);

    return list.concat([`$${condition.offset++}${castTimestamp(v)}`]);
  }, []);

  condition.value = `(${inList.join(',')})`;

  return condition;
};

/**
 * Interpolate values into a predicate with IS/IS NOT.
 *
 * @param {Object} condition - A condition object from {@link module:where~getCondition}.
 * @return {Object} The modified condition.
 */
const buildIs = function (condition) {
  if (condition.appended.operator === '=' || condition.appended.operator === 'IS') {
    condition.appended.operator = 'IS';
  } else {
    condition.appended.operator = 'IS NOT';
  }

  return condition;
};

/**
 * Handle the overloads for equality tests: interpolating null and boolean
 * values and building IN lists.
 *
 * @param {Object} condition - A condition object from {@link module:where~getCondition}.
 * @return {Object} The modified condition.
 */
const equality = function (condition) {
  if (condition.value === null || _.isBoolean(condition.value)) {
    return buildIs(condition);
  } else if (_.isArray(condition.value)) {
    return buildIn(condition);
  }

  condition.params.push(condition.value);

  condition.value = `$${condition.offset}${castTimestamp(condition.value)}`;

  return condition;
};

/**
 * Transform an array into a safe comma-delimited string literal.
 *
 * @param {Object} condition - A condition object from {@link module:where~getCondition}.
 * @return {Object} The modified condition.
 */
const literalizeArray = condition => {
  if (_.isArray(condition.value)) {
    const sanitizedValues = condition.value.map(function (v) {
      if (_.isString(v) && (v === '' || v === 'null' || v.search(/[,{}\s\\"]/) !== -1)) {
        return `"${v.replace(/([\\"])/g, '\\$1')}"`;
      } else if (v === null) {
        return 'null';
      }

      return v;
    });

    condition.params.push(`{${sanitizedValues.join(',')}}`);
  } else {
    condition.params.push(condition.value);
  }

  condition.value = `$${condition.offset}${castTimestamp(condition.value)}`;

  return condition;
};

/**
 * Operation definitions for parsing criteria objects.
 *
 * Keys are search strings in criteria keys. Values define an output SQL
 * operator and an optional mutator which will be applied to the appropriate
 * parameter value for the prepared statement.
 *
 * @enum
 * @readonly
 */
const map = {
  // basic comparison
  '=': {operator: '=', mutator: equality},
  '!': {operator: '<>', mutator: equality},
  '>': {operator: '>'},
  '<': {operator: '<'},
  '>=': {operator: '>='},
  '<=': {operator: '<='},
  '!=': {operator: '<>', mutator: equality},
  '<>': {operator: '<>', mutator: equality},
  'between': {operator: 'BETWEEN', mutator: buildBetween},
  // array
  '@>': {operator: '@>', mutator: literalizeArray},
  '<@': {operator: '<@', mutator: literalizeArray},
  '&&': {operator: '&&', mutator: literalizeArray},
  // pattern matching
  '~~': {operator: 'LIKE'},
  'like': {operator: 'LIKE'},
  '!~~': {operator: 'NOT LIKE'},
  'not like': {operator: 'NOT LIKE'},
  '~~*': {operator: 'ILIKE'},
  'ilike': {operator: 'ILIKE'},
  '!~~*': {operator: 'NOT ILIKE'},
  'not ilike': {operator: 'NOT ILIKE'},
  // regex
  'similar to': {operator: 'SIMILAR TO'},
  'not similar to': {operator: 'NOT SIMILAR TO'},
  '~': {operator: '~'},
  '!~': {operator: '!~'},
  '~*': {operator: '~*'},
  '!~*': {operator: '!~*'},
  // comparison predicates
  'is': {operator: 'IS', mutator: buildIs},
  'is not': {operator: 'IS NOT', mutator: buildIs},
  'is distinct from': {operator: 'IS DISTINCT FROM'},
  'is not distinct from': {operator: 'IS NOT DISTINCT FROM'}
};

exports = module.exports = key => {
  return _.clone(map[key]);
};

exports.buildBetween = buildBetween;
exports.buildIn = buildIn;
exports.buildIs = buildIs;
exports.equality = equality;
exports.literalizeArray = literalizeArray;
