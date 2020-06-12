'use strict';

const decompose = require('../util/decompose');

exports = module.exports = function (db) {
  return db.instance.query(db.loader.queryFiles['tables.sql'], db.loader).then(tables => decompose({
    pk: ['schema', 'name'],
    columns: ['schema', 'name', 'parent', 'pk', 'columns', 'is_insertable_into'],
    fks: {
      pk: 'fk',
      columns: {
        fk: 'fk',
        fk_dependent_columns: 'dependent_columns',
        fk_origin_schema: 'origin_schema',
        fk_origin_name: 'origin_name',
        fk_origin_columns: 'origin_columns'
      }
    }
  }, tables));
};
