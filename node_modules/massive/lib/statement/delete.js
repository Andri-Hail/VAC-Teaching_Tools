'use strict';

const _ = require('lodash');
const Statement = require('./statement');

/**
 * Represents a DELETE query.
 *
 * @class
 * @param {Table} source - Database object to query.
 * @param {Object|String|Number} [criteria] - A criteria object or primitive pk
 * value.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Delete options}.
 */
const Delete = function (source, criteria = {}, options = {}) {
  Statement.call(this, source, options);

  this.setCriteria(criteria);
};

Delete.prototype = Object.create(Statement.prototype);

/**
 * Format this object into a SQL DELETE.
 *
 * @return {String} A SQL DELETE statement.
 */
Delete.prototype.format = function () {
  let sql = 'DELETE FROM ';

  if (this.only) { sql += 'ONLY '; }

  sql += `${this.source.delimitedFullName} `;

  if (this.source.loader === 'join') {
    const target = this.source.joins[0];

    this.conditions = `${target.on} AND (${this.conditions}) `;

    sql += `USING ${target.relation} `;
    sql += _.tail(this.source.joins).map(j => `${j.type} JOIN ${j.target} ON ${j.on} `).join('');
    sql += `WHERE ${this.conditions} `;
    sql += `RETURNING ${this.source.delimitedFullName}.*`;
  } else {
    sql += `WHERE ${this.conditions} `;
    sql += `RETURNING ${this.returning.join(', ')}`;
  }

  return sql;
};

module.exports = Delete;
