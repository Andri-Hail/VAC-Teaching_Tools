'use strict';

const glob = require('glob');
const path = require('path');
const pgp = require('pg-promise');
const patterns = require('pg-promise/lib/patterns');

const loadedFiles = [];

exports = module.exports = (db) => new Promise((resolve, reject) => {
  glob(`${db.loader.scripts}/**/*.sql`, (err, files) => {
    if (err) {
      reject(err);
    }

    resolve(files);
  });
}).then(files => files.map(f => {
  const script = {
    schema: path.relative(db.loader.scripts, path.dirname(f)).replace(path.sep, '.'),
    name: path.basename(f, '.sql')
  };

  const extant = loadedFiles.find(qf => qf.file === f);

  if (extant) {
    script.sql = extant;
  } else {
    const loaded = new pgp.QueryFile(f, {minify: true});

    if (loaded.error) {
      throw loaded.error;
    }

    loadedFiles.push(loaded);
    script.sql = loaded;
  }

  const rawSQL = script.sql[pgp.as.ctf.toPostgres]();
  const valuesMatch = rawSQL.match(patterns.multipleValues);
  const namesMatch = rawSQL.match(patterns.namedParameters);

  script.arity = (valuesMatch && valuesMatch.length || 0) + (namesMatch && namesMatch.length || 0);

  return script;
}));
