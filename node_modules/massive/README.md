# Massive.js: A Postgres-centric Data Access Tool

[![node](https://img.shields.io/node/v/massive.svg)](https://npmjs.org/package/massive)
[![Build Status](https://img.shields.io/gitlab/pipeline/dmfay/massive-js.svg)](https://gitlab.com/dmfay/massive-js/pipelines)
[![Coverage Status](https://coveralls.io/repos/gitlab/dmfay/massive-js/badge.svg)](https://coveralls.io/gitlab/dmfay/massive-js)
[![npm](https://img.shields.io/npm/dw/massive.svg)](https://npmjs.org/package/massive)

Massive is a data mapper for Node.js that goes all in on PostgreSQL, and embraces the power and flexibility of SQL itself and of the relational metaphor. With minimal abstractions for the interfaces and tools you already use, its goal is to do just enough to make working with your data and your database as easy and intuitive as possible, then get out of your way.

Massive is _not_ an object-relational mapper (ORM)! It doesn't use models, it doesn't track state, and it doesn't box you into working and thinking in terms of individual entities. Massive connects to your database and introspects its schemas to build an API for the data model you already have: your tables, views, functions, and easily-modified SQL scripts.

Here are some of the highlights:

* **Dynamic query generation**: Massive's versatile query builder supports a wide variety of operators in a simple [criteria object](https://massivejs.org/docs/criteria-objects), and can handle everything from complex sorting in [`order`](https://massivejs.org/docs/options-objects#ordering-results) to true upserts with[ `onConflictUpdate`](http://massivejs.org/docs/options-objects#onconflictupdate).
* **Low overhead**: An API built from your schema means direct access to your tables, views, and functions; raw SQL when you need it; super-simple bulk operations; and no model classes to maintain!
* **Join what you need, when you need it**: Call [`join()`](https://massivejs.org/docs/joins-and-result-trees#readablejoin) on any table or view to use Massive's query and even persistence methods over multiple relations at once.
* **Document storage**: PostgreSQL's JSONB data type makes it possible to blend relational and document techniques. Massive makes working with documents as straightforward as possible: objects in, objects out, with the metadata managed for you.
* **Transactions**: Use [`db.withTransaction()`](https://massivejs.org/docs/tasks-and-transactions) to execute a callback with full Massive API support in a transaction scope, getting a promise which fulfills if it commits or rejects if it rolls back.
* **Postgres everything**: Many, if not most, relational data access tools are built with compatibility across various relational database management systems in mind. Massive is not. By committing to a single RDBMS, Massive gains support for array fields and operations, regular expression matching, foreign tables, materialized views, and more features found in PostgreSQL but not its competition.

## Installation

```
npm i massive --save
```

## Documentation

Documentation and API docs are at [MassiveJS.org](https://massivejs.org).

## Contributing

[See CONTRIBUTING.md](https://gitlab.com/dmfay/massive-js/blob/master/CONTRIBUTING.md).

## Older Versions

If you need a callback-based API, install Massive.js v2: `npm install massive@2`

Documentation for Massive.js 2.x is at [readthedocs](http://massive-js.readthedocs.org/en/v2/).
