'use strict';

const _ = require('lodash');
const util = require('util');
const murmurhash = require('murmurhash').v3;
const parseKey = require('./util/parse-key');
const quote = require('./util/quote');
const Entity = require('./entity');
const Select = require('./statement/select');

/**
 * A readable database entity (table or view).
 *
 * @class
 * @extends Entity
 * @param {Object} spec - An {@linkcode Entity} specification representing a
 * readable object:
 * @param {Object} spec.db - A {@linkcode Database}.
 * @param {String} spec.name - The table or view's name.
 * @param {String} spec.schema - The name of the schema owning the table or
 * view.
 * @param {Object|Array} spec.columns - An array of column names, or an object
 * mapping constituent Readable names to their column name arrays.
 * @param {Object} spec.joins - A join object.
 * @param {Boolean} [spec.is_matview] - Whether the object is a materialized view
 * (default false).
 */
const Readable = function (spec) {
  Entity.apply(this, arguments);

  this.columnNames = spec.columns;
  this.columns = spec.columns.map(c => ({
    schema: this.schema,
    parent: this.name,
    name: c,
    fullName: `${this.delimitedFullName}."${c}"`
  }));
  this.isMatview = spec.is_matview || false;
};

util.inherits(Readable, Entity);

/**
 * Generate a consistent alias for a field belonging to this Readable.
 *
 * @param {String} field - The field to alias.
 * @return {String} An alias separating schema (if necessary), relation, and
 * field names with double underscores.
 */
Readable.prototype.aliasField = function (field) {
  if (this.schema === this.db.currentSchema) {
    return `${this.name}__${field}`;
  }

  return `${this.schema}__${this.name}__${field}`;
};

/**
 * Count rows matching criteria. There are two ways to use this method:
 *
 * 1. find() style: db.mytable.count({field: value});
 * 2. where() style: db.mytable.count("field=$1", [value]);
 *
 * @param {Object|String} conditions - A criteria object or SQL predicate.
 * @param {Array} params - Prepared statement parameters for use with raw SQL
 * predicates.
 * @return {Promise} Row count.
 */
Readable.prototype.count = function (conditions = {}, params = []) {
  if (_.isString(conditions)) {
    conditions = {
      conditions,
      params
    };
  }

  const query = new Select(this, conditions, {exprs: {count: 'COUNT(1)'}, order: null, single: true});

  return this.db.query(query).then(res => res.count);
};

/**
 * Count documents matching criteria. Unlike count, this function only supports
 * criteria objects.
 *
 * @param {Object} criteria - A criteria object.
 * @return {Promise} Number of matching documents.
 */
Readable.prototype.countDoc = function (criteria = {}) {
  const query = new Select(this, criteria, {
    exprs: {count: 'COUNT(1)'},
    order: null,
    single: true,
    document: true
  });

  return this.db.query(query).then(res => res.count);
};

/**
 * Find rows matching criteria.
 *
 * @param {Object|UUID|Number} criteria - A criteria object or primary key value.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Select options}.
 * @return {Promise} An array containing any query results.
 */
Readable.prototype.find = function (criteria = {}, options = {}) {
  return this.db.query(new Select(this, criteria, options));
};

/**
 * Find a document by searching in the body.
 *
 * @param {Object|UUID|Number} [criteria] - A criteria object or primary key value.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Select options}.
 * @return {Promise} An array containing any query results.
 */
Readable.prototype.findDoc = function (criteria = {}, options = {}) {
  options.document = true;

  return this.find(criteria, options);
};

/**
 * Return a single record.
 *
 * @param {Object|UUID|Number} criteria - A criteria object or primary key value.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Select options}.
 * @return {Promise} An object representing the (first) record found, or
 * null if no records match.
 */
Readable.prototype.findOne = function (criteria, options = {}) {
  if (this.loader === 'join') {
    return this.db.$p.reject(new Error('findOne is not supported with compound Readables.'));
  }

  return this.find(criteria, _.assign(options, {single: true}));
};

/**
 * Refresh a materialized view.
 *
 * @param {Boolean} [concurrently] - Do it without locking reads.
 * @return {Promise} A query with no results.
 */
Readable.prototype.refresh = function (concurrently) {
  if (!this.isMatview) {
    return this.db.$p.reject(new Error(`${this.delimitedName} is not a materialized view`));
  }

  const concurrentlyStr = concurrently ? 'CONCURRENTLY' : '';

  return this.db.query(`REFRESH MATERIALIZED VIEW ${concurrentlyStr} ${this.delimitedFullName}`);
};

/**
 * Perform a full-text search on queryable fields. If options.document is true,
 * looks in the document body fields instead of the table columns.
 *
 * @param {Object} plan - Search definition.
 * @param {Array} plan.fields - List of the fields to search.
 * @param {String} plan.term - Search term.
 * @param {Object} [plan.where] - Criteria object to filter results.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Select options}.
 * @param {Boolean} doDocumentProcessing - True to process results as documents.
 * @return {Promise} An array containing any query results.
 */
Readable.prototype.search = function (plan, options = {}, doDocumentProcessing = false) {
  if (!plan.fields && !plan.tsv) {
    return this.db.$p.reject(new Error('Plan must contain a fields array or tsv string'));
  } else if (!plan.term) {
    return this.db.$p.reject(new Error('Plan must contain a term string'));
  }

  if (!plan.tsv) {
    if (plan.fields.length === 1) {
      plan.to_tsv = plan.fields[0];

      if (plan.to_tsv.indexOf('>>') === -1) {
        plan.to_tsv = quote(plan.to_tsv); // just a column, quote it to preserve casing
      }
    } else {
      plan.to_tsv = `concat(${plan.fields.join(", ' ', ")})`;  // eslint-disable-line quotes
    }
  }

  if (plan.to_tsv) {
    plan.tsv = `to_tsvector(${plan.to_tsv})`;
  }

  switch (plan.parser) {
    case 'plain': plan.parser = 'plainto_tsquery'; break;
    case 'phrase': plan.parser = 'phraseto_tsquery'; break;
    case 'websearch': plan.parser = 'websearch_to_tsquery'; break;
    default: plan.parser = 'to_tsquery'; break;
  }

  const criteria = {
    conditions: `${plan.tsv} @@ ${plan.parser}($1)`,
    params: [plan.term],
    where: plan.where,
    isDocument: options.document
  };

  if (doDocumentProcessing) {
    options.document = true;
  }

  const query = new Select(this, criteria, options);

  return this.db.query(query);
};

/**
 * Shortcut to perform a full text search on a document table.
 *
 * @param {Object} plan - Search definition.
 * @param {Array} [plan.fields] - List of the document keys to search.
 * @param {String} plan.term - Search term.
 * @param {Object} [plan.where] - Criteria object to filter results.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Select options}.
 * @return {Promise} An array containing any query results.
 */
Readable.prototype.searchDoc = function (plan, options = {}) {
  if (!plan.fields) {
    plan.tsv = 'search';
  } else {
    plan.fields = plan.fields.map(key => {
      return `(body ->> '${key}')`;
    });
  }

  return this.search(plan, options, true);
};

/**
 * Find the foreign key relationships which exist between this readable and its
 * parent in a join context.
 *
 * @param {Readable} parentReadable - The readable being joined to.
 * @param {String} parentAlias - The alias corresponding to parentReadable in
 * the current join tree.
 * @return {Array} A list of foreign key relationships represented as objects
 * mapping fields of this Readable to their corresponding fields in
 * `parentReadable`.
 */
Readable.prototype.findCandidateJoinKeys = function (parentReadable, parentAlias) {
  return _.chain(this.fks)
    .concat(parentReadable.fks)
    .compact()
    .reduce((allJoinPredicates, fk) => {
      // standardize the join criteria with the table being joined on the
      // left side regardless of the foreign key's directionality
      let leftColumns, rightColumns;

      if (fk.origin_schema === this.schema && fk.origin_name === this.name) {
        leftColumns = fk.origin_columns;
        rightColumns = fk.dependent_columns;
      } else if (fk.origin_schema === parentReadable.schema && fk.origin_name === parentReadable.name) {
        leftColumns = fk.dependent_columns;
        rightColumns = fk.origin_columns;
      }

      if (leftColumns && rightColumns) {
        // columns on the right side always belong to the parent relation
        // and must be prefixed with its alias for parseKey
        allJoinPredicates[fk.fk] = _.zipObject(leftColumns, rightColumns.map(c => `${parentAlias}.${c}`));
      }

      return allJoinPredicates;
    }, {})
    .toPairs()
    .value();
};

/**
 * Build the criteria for the ON part of a JOIN clause. This is done ahead of
 * time since the JOIN criteria for a compound Readable never change. The entire
 * clause is not built because different statements use different syntax: a
 * DELETE, for example, joins its first additional relation with the keyword
 * USING.
 *
 * @param {Object} criteria - The criteria object representing the JOIN
 * conditions. May be nested with `or`, just as ordinary criteria objects.
 * @param {String} joiner - The alias of the relation to which the criteria
 * apply.
 * @return {String} The JOIN condition text, to be stored and interpolated into
 * queries after the ON.
 */
Readable.prototype.buildJoinConjunction = function (criteria, joiner) {
  const conjunctions = _.map(criteria, (val, joinKey) => {
    if (joinKey === 'or') {
      const disjunctions = val.map(v => this.buildJoinConjunction(v, joiner));

      return `(${disjunctions.join(' OR ')})`;
    }

    const sourceKey = parseKey(val, this);

    return `("${joiner}"."${joinKey}" = ${sourceKey.path})`;
  });

  if (conjunctions.length > 1) {
    return `(${conjunctions.join(' AND ')})`;
  }

  return conjunctions[0];
};

/**
 * Create a compound Readable by declaring other relations to attach. Queries
 * against the compound Readable will `JOIN` the attached relations and
 * decompose results into object trees automatically.
 *
 * Compound Readables are cached. If the same join plan is encountered
 * elsewhere, Massive will pull the compound Readable from the cache instead of
 * processing the definition again.
 *
 * @param {Object} definition - An object mapping relation paths (optional
 * schema and dot, required name) or aliases to objects defining the join `type`
 * (inner, left outer, etc); `on` mapping the foreign column(s) in the relation
 * being joined to the source column(s) in the relation being joined to; and an
 * optional `relation` path if an alias is used for the key. These objects may
 * be nested.
 * @return {Readable} The compound Readable.
 */
Readable.prototype.join = function (definition) {
  const name = murmurhash(`${this.path}.${JSON.stringify(definition)}`);

  if (Object.hasOwnProperty.call(this.db.entityCache, name)) {
    return this.db.entityCache[name];
  }

  // single table-to-table inner joins on a foreign key relationship can be
  // expressed just by giving the name of the table to join, but the reducer
  // still expects to see an object with the appropriate key and _some_ value
  if (_.isString(definition)) {
    definition = _.set({}, definition, true);
  }

  const seenAliases = [this.name];
  const primaryPk = (definition.pk ? _.castArray(definition.pk) : this.pk).map(this.aliasField, this);
  const decompositionSchema = {
    pk: primaryPk,
    columns: this.columns.reduce((map, c) => {
      map[this.aliasField(c.name)] = c.name;

      return map;
    }, {})
  };
  let schemaNodeParent = decompositionSchema;

  // if passed an explicit pk for a view at the root of the join tree, ensure
  // it doesn't get processed as part of that tree
  delete definition.pk;

  // This reducer is building several things at once, going node by node in the
  // definition tree:
  //
  // * the formal definition tree with standardized paths
  // * the decomposition schema tree, which has exactly the same shape as the
  // definition tree
  // * the list of member relations
  // * the list of involved columns from the member relations
  // * the list of seen aliases, to forestall reuse of same
  const reducer = (acc, val, key) => {
    // The original definition's keys each refer to a relation to be attached
    // in the compound Readable. However, they can refer to it in different
    // ways:
    //
    // * as a schema.relation path
    // * as a relation name alone, where the schema is db.currentSchema
    // * as an alias, in which case the definition must include either of the
    // above as a property `relation`
    //
    // The final definition reorganizes the original's properties to eliminate
    // the first category: all keys must be relation names or aliases.
    const lexed = parseKey.lex(val.relation || key, this);
    const relation = lexed.tokens.pop();
    const schema = lexed.tokens.length ? lexed.tokens.shift() : undefined;
    const alias = val.relation ? key : relation;
    const readable = _.get(this.db, _.compact([schema, relation]));

    if (!readable) {
      throw new Error(`Bad join definition: unknown database entity ${val.relation || key}.`);
    } else if (seenAliases.some(a => a === alias)) {
      throw new Error(`Bad join definition: ${alias} is repeated.`);
    } else if (!val.pk && !readable.pk) {
      throw new Error(`Missing explicit pk in join definition for ${alias}.`);
    }

    seenAliases.push(alias);

    // setting up for recursion: store the parent schema node pointer and
    // enter the "current" scope which defines the parent for any nested nodes
    const outerParent = schemaNodeParent;

    if (!val.omit) {
      // create this node in the parallel decomposition schema tree
      schemaNodeParent[alias] = {};

      const schemaNodeCurrent = schemaNodeParent[alias];

      schemaNodeCurrent.pk = (val.pk ? _.castArray(val.pk) : readable.pk).map(c => `${alias}__${c}`);
      schemaNodeCurrent.decomposeTo = val.decomposeTo;
      schemaNodeCurrent.columns = readable.columns.reduce((map, c) => {
        const columnAlias = `${alias}__${c.name}`;

        map[columnAlias] = c.name;

        return map;
      }, {});

      schemaNodeParent = schemaNodeCurrent;
    }

    // if not given an explicit join predicate, attempt to fall back on an
    // unambiguous foreign key relationship between the relations
    let on = val.on;

    if (!on) {
      const candidateFks = readable.findCandidateJoinKeys(val.parentReadable || this, val.parentAlias || this.delimitedFullName);

      switch (candidateFks.length) {
        case 1: on = candidateFks[0][1]; break;
        case 0: throw new Error(`An explicit 'on' mapping is required for ${val.relation || key}.`);
        default: throw new Error(`Ambiguous foreign keys for ${val.relation || key}. Define join keys explicitly.`);
      }
    }

    // standardize this node in the definition tree, recursing if necessary
    acc[alias] = _.reduce(val, (node, v, k) => {
      switch (k) {
        case 'type':
        case 'on':
        case 'schema':
        case 'relation':
        case 'pk':
        case 'omit':
        case 'parentReadable':
        case 'parentAlias':
        case 'decomposeTo':
          return node;
        default:
          // Any other property is a descendant definition node. Attach its
          // parent info and recurse, standardizing it and adding to the
          // current node.
          v.parentReadable = readable;
          v.parentAlias = alias;

          return reducer(node, v, k);
      }
    }, {
      schema,
      relation,
      alias,
      readable,
      type: val.type || 'INNER',
      on,
      joinRelations: [],
      joinColumns: []
    });

    // restore the parent schema node pointer
    schemaNodeParent = outerParent;

    // Add the join relation and its columns to the node accumulator. It's
    // stored there because we want the column order and JOIN order to match
    // the tree layout (a "pre-order" traversal: parents before children, in
    // sequence) -- Postgres won't toposort JOIN clauses for us. However, since
    // we're only ready to accumulate relations and columns _after_ the
    // recursive reduction, we're forced into a "post-order" traversal
    // (children first, parents as all their children are accumulated). To
    // restore the desired order, we accumulate descendant relations and columns
    // on the node and collect them after recursion.
    acc.joinRelations = _.concat(acc.joinRelations, [acc[alias]], acc[alias].joinRelations);
    acc.joinColumns = _.concat(acc.joinColumns, readable.columns.map(c => {
      return {
        schema: c.schema,
        parent: c.parent,
        name: c.name,
        fullName: `"${alias}"."${c.name}"`,
        alias: `${alias}__${c.name}`
      };
    }), acc[alias].joinColumns);

    // strictly speaking, only leftover joinRelations or joinColumns on the
    // origin node will cause problems, but it's better to keep things clean.
    delete acc[alias].joinRelations;
    delete acc[alias].joinColumns;

    return acc;
  };

  definition = _.reduce(definition, reducer, {
    joinRelations: [],
    joinColumns: this.columns.map(c => {
      c.alias = this.aliasField(c.name);

      return c;
    })
  });

  // this form of joinRelations is temporary; it's only declared here because
  // there has to be something to reference in the `clone` construction just
  // below. Before the compound Readable is fully finished, `joinRelations` will
  // be augmented with additional information about each attached relation.
  let joinRelations = definition.joinRelations;
  const joinColumns = definition.joinColumns;

  delete definition.joinRelations;
  delete definition.joinColumns;

  const clone = new Proxy(this, {
    get: (target, prop) => {
      switch (prop) {
        case 'loader': return 'join';
        case 'joins': return joinRelations;
        case 'columns': return joinColumns;
      }

      if (
        typeof target[prop] === 'function' &&
        ['find', 'findOne', 'search', 'where'].indexOf(prop) > -1
      ) {
        // apply a decomposition schema to the options argument for all
        // non-document non-count Readable functions
        return new Proxy(target[prop], {
          apply: (fn, thisArg, args) => {
            const optionsIdx = prop === 'where' ? 2 : 1;
            const optionsObj = args[optionsIdx] || {};
            const override = optionsObj.decompose;

            args[optionsIdx] = _.assign(optionsObj, {
              decompose: override || decompositionSchema
            });

            return fn.apply(thisArg, args);
          }
        });
      }

      return target[prop];
    }
  });

  joinRelations = joinRelations.map(joinRelation => {
    // build everything we need for 'on' clauses ahead of time; since parseKey
    // only looks to compound Readables for alternate schema/relation paths,
    // this has to happen after instantiation of the clone.
    const delimitedAlias = quote(joinRelation.alias);

    joinRelation.target = delimitedAlias === joinRelation.readable.delimitedFullName ?
      delimitedAlias :
      `${joinRelation.readable.delimitedFullName} AS ${delimitedAlias}`;

    joinRelation.on = clone.buildJoinConjunction(joinRelation.on, joinRelation.alias);

    return joinRelation;
  });

  this.db.entityCache[name] = clone;

  return clone;
};

/**
 * Run a query with a raw SQL predicate, eg:
 *
 * db.mytable.where('id=$1', [123]).then(...);
 *
 * @param {String} conditions - A raw SQL predicate.
 * @param {Array} [params] - Prepared statement parameters.
 * @param {Object} [options] - {@link https://massivejs.org/docs/options-objects|Select options}.
 * @return {Promise} An array containing any query results.
 */
Readable.prototype.where = function (conditions, params = [], options = {}) {
  if (!_.isArray(params) && !_.isPlainObject(params)) { params = [params]; }

  const query = new Select(this, {conditions, params}, options);

  return this.db.query(query);
};

module.exports = Readable;
