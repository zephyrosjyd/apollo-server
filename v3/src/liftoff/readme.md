# Liftoff

For your consideration: Liftoff, a translucent reactive framework.

*Translucent* as in you can still see your code inside it. Liftoff introduces some new concepts and a few new restrictions, but by and large lets you write comfortable, synchronous JS/TS that is reactive nevertheless.

_<div style='text-align: center'>Liftoff is a bit like React for your server</div>_

You know how React turns your world into components and can show you state of the whole tree? Liftoff does that.

You know how components can fail or suspend and the rest of the system keeps on trucking? Liftoff does that.

On the other hand, you know how with React, it's tricky to pass data between distant components? Liftoff doesn't do that.

_<div style='text-align: center'>Liftoff is a bit like Redux for your whole program.</div>_

By which I mean the *good parts* of Redux: time travel, error recovery, a clear timeline.

_<div style='text-align: center'>Liftoff is a bit like a spreadsheet.</div>_

If you hate spreadsheets you should probably forget you read that sentence. In fact, just skip this whole paragraph. But everyone else: you know how in a spreadsheet, you can change a single box and the change flows through the whole sheet? Liftoff does that in JS.

In Liftoff, we can retry functions after they fail. We can synchronously read the value of promises. Functions can return multiple times, their results flowing around the system.

🧠To learn how Liftoff works, jump to [from the ground up](#From-the-ground-up).

👁To see what you can do with it, continue to [from above](#From-above).

## From above

### code as configuration

You configure the system with code.

```typescript
import { Apollo, Server, Schema, Resolvers } from '@apollo/core'
import { Billing } from '@hypothetical/plugins'
import { ambient, todo } from './directives'
import typeDefs from './schema.gql'
import resolvers from './schema.resolver'

Apollo(() => {
  Server()
  Schema(typeDefs, { ambient, todo })
  Resolvers(resolvers)
  Billing()
})
```

The order of these calls doesn't matter.

### composable configuration

Because you configure with code, you might assume you can do things like this:

```typescript
import { Apollo, Server, Schema, Resolvers }
  from '@apollo/core'
import { Billing } from '@hypothetical/plugins'
import { DevTools } from '@hypothetical/plugins'
import { ambient, todo } from './directives'
import typeDefs from './schema.gql'
import resolvers from './schema.resolver'

function Base() {
  Server()
  Billing()
}

Apollo(() => {
  Base()
  Schema(typeDefs, { ambient, todo })
  Resolvers(resolvers)

  if (process.env.NODE_ENV === 'development') {
    DevTools()
  }
})
```

You would be correct.

### refs — referring to configurable data

We can use `ref`s to define data that we want someone else to provide.

A toy example:

#### providing toys

```typescript
/******** main.ts ********/

import { Apollo } from '@apollo/core'
import { Toy, ToyPlugin } from './toy.ts'

Apollo(() => {
  // We can provide Toys from anywhere, before or after their
  // consumer is defined.
  Toy('talula')
  StoryToys()
  ToyPlugin()  // 👈🏽 consumer will be defined in here (below)
  Toy('mr. winkles')
})

function StoryToys() {
  Toy('woody')
  Toy('mr. potatohead')
  Toy('little bo peep')
}
```

#### defining and consuming toys

```typescript
/******** toy.ts ********/

import { ref } from '@apollo/core'

// You generally write refs at the top level and export them
export const Toy =
  // type 👇🏽    description 👇🏽
  ref <string> `The name of a toy` () // 👈🏽 default value (optional, empty here)

export ToyPlugin(() => {
  // We can iterate over all Toys like so:
  for (const toy of Toy) {
    // play with each toy
  }

  // Want an array?
  const toys: string[] = [...Toy]

  // (TS will infer the type of toys. I'm writing it out for demonstration
  // purposes.)

  // So now:
  //   toys = ['talula',
  //           'mr. winkles',
  //           'woody',
  //           'mr. potatohead',
  //           'little bo peep']
  // And we can play with them.
})
```

### `read()`ing refs

You can `read` the value of a ref:

```typescript
export const Planet = ref <string> `name of a planet` ()

Apollo(() => {
  Planet('Earth')
  const planet = read(Planet)

  // `go` declares an an effect
  // it reboots when its dependencies change
  // like React, we do a shallow identity comparison of the
  // deps.
  //   this is 👇🏽 the dependency
  go `print "${planet}"` (() => {
    console.log(planet)
  })
})
```

That prints "Earth". But what does this do?

```typescript
export const Planet = ref <string> `name of a planet` ()

Apollo(() => {
  Planet('Mercury')
  Planet('Venus')
  Planet('Earth')
  Planet('Mars')

  const planet = read(Planet)
  go `print "${planet}"` (() => {
    console.log(planet)
  })
})
```

`Planet` is a `ref<string>`, so `read` will return a string.

But there are multiple `Planet`s. So `read` returns multiple times.

Liftoff _blooms_ the caller. It re-evaluates once for each defined value of `Planet`.

### implementing schema modules

We now know enough to understand how the server collects all those `Schema` and
`Resolvers` calls into an executable schema:

```typescript
import {ref, single, reduce, condense, value}
  from 'apollo-server'

// You can specify refs as functions.
//
// Doing so lets you format arguments into objects. Compare: Redux action
// creators.
//
// The ref takes on the function's return value. So this is
// a Ref<{ typeDefs: string, directives: IDirectives }>
export const Schema = ref `GraphQL Schema Definition` (
  (typeDefs: string, directives: IDirectives) => ({
    typeDefs, directives
  }))

// A less fancy ref.
export const Resolvers = ref<IResolvers>()

export const ExecutableSchema = ref `Executable GraphQL Schema` (() => {
  const typeDefs = read(
    Schema.typeDefs[reduce](mergeSchemas)
  )

  const schemaDirectives = read(
    Schema.directives[condense]
      // [condense] merges all rows together. It's equivalent to:
      //   [reduce]((all, these) => ({ ...all, ... these }))
  )

  const resolvers = read(Resolvers[condense])

  return createAndValidateExecutableSchema({
    typeDefs,
    resolvers,
    schemaDirectives
  })
})
```

### sources — representing changing values

Sources emit values.

### a ticker

```typescript
import {go, source} from '@apollo/core'

const seconds = source <number> `seconds elapsed, very approximate` (emit => {
  // go defines an effect.
  go(() => {
    let count = 0
    const interval = setInterval(() => emit(count++), 1000)

    // Like React's useEffect, go effects return dispose functions
    return () => clearInterval(interval)
  })
})
```

To read a source, we can put it in a box:

```typescript
export default `Count schema` (() => {
  Schema(`
    extend Query {
      motd: String
    }
  `)
  const sec: Cell<number> = box(seconds)
  Resolvers({
    Query: {
      seconds() {
        return sec.value
      }
    }
  })
})
```

`sec` is a box holding the current value of seconds. Think of a cell in a spreadsheet. A box is a stable object that holds a changing value.  Whenever seconds emits (about once per second) we scribble out the old value and put a new one in the box.

Cells help us pass source values into closures. If we did this:

```typescript
  // Probably don't do this:
  const secondsNum: number = read(seconds)
  Resolvers({
    Query: {
      seconds() {
        return sec
      }
    }
  })
})
```

It would work. Every time `seconds` emitted a new value, `read(seconds)` would return, we'd re-evaluate the caller. This would dispose of the previous `Resolvers` and create new ones that close over the new `secondsNum`.

It's all a bit much. To avoid the re-evaluation, we put the source in a box. When you `box` a source, you always get the same object back. Since the box itself never changes identity, the `seconds` resolver can safely close over it, fetching its `.value` anew with each request.

A less contrived example: a message of the day.

### message of the day

```typescript
import {box, ref} from '@apollo/core'
import {pollJson} from './poll'

const motdUrl = ref <string> `Message of the day URL` ()

export default (() => {
  const motd = box(() => pollJson(read(motdUrl), 1000 * 60 * 60 * 12))

  // box.value will be changing under us. But the box stays stable, so we
  // don't re-evaluate when the value changes. That's okay—we don't have to!
  Schema(`
    extend Query {
      motd: String
    }
  `)
  Resolvers({
    Query: {
      motd() {
        return motd.value
      }
    }
  })
})
```

### dynamic config polled from a url

Let's poll configuration from a URL.

Define the poller:

```typescript
/******** poll.ts ********/

import {source, go} from 'apollo-server'

export const pollJson = <T extends object>(url: string, ms: number = 1000) =>
  // A source takes a function that receives an emit function and
  // calls it to emit some values.
  source<T>((emit, fail) => ({
    // `go` declares an an effect
    // it reboots when its dependencies change
    // like React, we do a shallow identity comparison of the
    // deps.
    //   these 👇🏽          👇🏽 are its dependencies
    go `poll ${url} every ${ms}ms` (() => {
      const iv = setInterval(async () => {
        try {
          emit(await getJson<T>(url))
        } catch(err) {
          fail(err)
        }
      }, ms)
      return () => clearInterval(iv)
    })
  })
```

Use it to configure a schema:

```typescript
/******** gateway.ts ********/

import {read, map, filter, condense, many} from '@apollo/core'
import {pollJson} from './poll'
import * as supported from './directives'

interface IConfig {
  typeDefs: string,
  enabledDirectives: string[]
}

export const GatewayConfigUrl = ref <string> ()

export default ((resolvers: IResolvers) => {
  // Suspend until someone provides a GatewayConfigUrl, then start polling it.
  const configSource = pollJson<IConfig>(read(GatewayConfigUrl))

  // `read.deep` differs from `read` in that it performs a deep
  // comparison of the object whenever the source emits and avoids emitting
  // if the object hasn't changed.
  const newConfig = read.deep(configSource)

  // Let's suppose that in addition to the schema, config provides
  // an array of enabled directives. How would we enable those?
  const directives = read(
    // many.unique<R>(iterable: R) creates a Many<R> holding the unique
    // values yielded by the iterable.
    //
    // We could do this with array methods, but working with a Many means
    // that when we get a new config, we only have to process the change,
    // rather than having to re-process all the directives.
    many.from(config.enabledDirectives)
      [where](enabled => enabled in supported)
      [map](enabled => ({ [enabled]: supported[enabled] }))
      [condense]
  )

  // Finally, declare the schema.
  Schema(config.typeDefs, directives)
})
```

### part — isolating failure and suspense

Whenever we try to `read` something, we might end up failing or suspending.

Currently, that means the whole system fails or suspends, which is not great!

Breaking the system into `part`s gives us isolation:

```typescript
import {read, ref} from '@apollo/core'
import {pollJson} from './poll'

const motdUrl = ref <string> `Message of the day URL` ()

export default part `Message of the day schema` (() => {
  // If either of these reads fail, the Message of the day schema doesn't
  // come up, but everything else is ok!
  const motd = read(pollJson(read(motdUrl), 1000 * 60 * 60 * 12))
  Schema(`
    extend Query {
      motd: String
    }
  `)
  Resolvers({
    Query: { motd() { return motd } }
  })
})
```

### injecting behavior

You can inject behavior the same way you inject anything else: by making a ref
for it. "It" in this case will be a function.

#### consuming functions

```typescript
/******** songs.resolvers.ts ********/
import {read, Many} from '@apollo/core'
import {Song} from '@spotify/client'

// You can have refs to functions too!
// This one returns your favorite songs.
export const getFavorites = ref<(uid: string, count: number) => Many<Song>>()

// We can put whole features into boxes.
// Boxes provide isolation: if the contents fail to evaluate, the box goes into
// a failing state (box.error becomes defined), but other parts of the system
// keep going.
export default box(() => {
  Schema(`
    extend type User {
      favorites: Song[]
    }
  `)

  // `read.the` ensures that we just get one value out of a ref.
  // If it's been defined multiple times, we fail until it's defined just
  // once.
  //
  // getFavories never really changes, so blocking here should be fine.
  const faves = read.the(getFavorites)

  Resolvers({
    User: {
      favorites(user: {spotifyId: string, count: number = 100}) {
        return faves(user.spotifyId, count)
      }
    }
  })
})
```

#### providing functions

```typescript
/******** spotify.ts ********/
import {read,many} from '@apollo/core'
import {getFavorites} from './songs.resolvers'
import SpotifyClient, {Song} from '@spotify/client'

export const spotifyApiKey = ref<string> `spotify api key` ()

export default (() => {
  // Resources take an acquire function, which returns the resource, and a
  // release function, which takes the resource and disposes of it.
  const client = resource(
    () => new SpotifyClient(read(spotifyApiKey)),
    client => client.close()
  )
  getFavorites((uid: string, count: number) =>
    // Get many favorites.
    // This Many will resolve asynchronously, but we can treat it like any
    // other.
    //      we can specify a field to use as a unique id 👇🏽
    many.from(client.getFavorites(uid, {limit: count}), 'id')
  )
})
```

### scoping data

Boxes also let you scope values.

Let's associate the http request with the graphql request:

```typescript
import {request, timing} from '@apollo/metrics'

// Scoped lets us associate plans with an object, i.e. the request.
import { box } from '@apollo/core'

import { Execute } from '@apollo/server'
import { parseHttpRequest, sendResponse, sendError } from './httpTransport'

export const http = ref `HTTP Request/Response` (
  (req: IncomingMessage, res: ServerResponse) => ({ request, response })
)

export default box <HttpHandler> (() =>
  const execute = read.the(Execute)
  const request = box(http)
  return (req, res) => {
    const gqlRequest = parseHttpRequest(req)
    // Put a scoped value in the box
    request.for(gqlRequest) (req, res)
    return execute(gqlRequest)
      .then(sendResponse, sendError)
  }
})
```

Using it:

```typescript
import {box} from '@apollo/core'
import {ResolveArg} from '@apollo/server'
import {http} from './httpHandler.ts'
import {readAmbientArg} from './httpTransport.ts'

export default box `@ambient directive` ((name = 'ambient') => {
  const request = box(http)
  mid(ResolveArg[where](arg => arg.directives.has(name))) (
    _next => (gqlRequest, field) =>
      readAmbientArg(gqlRequest, field, request.for(gqlRequest).value)
  )
})
```

### metrics

Declaring and updating some metrics:

```typescript
import {request, timing} from '@apollo/metrics'

import { scope, mid } from '@apollo/core'

// By convention, middleware chains are prefixed with 'mid'
import { Execute } from '@apollo/server'

// request is a meter provided by @apollo/metrics.
// By default, it provides three pipes: `start`,
// `stop.ok` and `stop.fail`
export const RequestMeter = request `GraphQL Request` <GraphQLRequest> ()

export default RequestMetrics() {
  const meters = box(RequestMeter)
  mid(Execute) ((exec) => {
    return async gqlRequest => {
      const meter = meters.for(gqlRequest).try?.start(gqlRequest)
      try {
        const result = await exec(gqlRequest)
        // Stop the meter, request finished ok.
        meter?.stop.ok(result)
        return result
      } catch(error) {
        // Stop the meter, request failed.
        meter?.stop.fail(error)
        throw error
      }
    }
  })
}
```

Other plugins can associate their requests with this one, provided they have
access to the scope object (the GraphQL Request object, in this case).

```typescript
import {request, timing} from '@apollo/metrics'
// By convention, middleware chains are prefixed with 'mid'
import { Execute } from '@apollo/server'
import {Transact, Transaction} from '@hypothetical/db'

const TransactionMeter = request `Database Request for ${transact}` <Txn> ()
export const DbTransaction = ref <Transaction> `Current transaction` ()

export default TransactionsPlugin(transact: Transact) {
  const meters = box(TransactionMeter)
  const transaction = box(DbTransaction)
  mid(Execute) ((exec, ctx) => {
    return async gqlRequest => {
      const meter = meters.for(gqlRequest).try
      try {
        const result = await transact(txn => {
          transaction.for(gqlRequest)(txn)
          meter?.start(txn)
          return exec(gqlRequest)
        })
        meter?.stop.ok(result)
        return result
      } catch(error) {
        // Stop the meter, request failed.
        meter?.stop.fail(error)
        throw error
      }
    }
  })
}
```

Collecting resolution times for individual fields:

```typescript
import {mid} from '@apollo/core'
import {ResolveField} from '@apollo/server'
import {timing} from '@apollo/metrics'

const FieldResolutionMeter = timing <Field> `time to resolve field`

export default FieldMetrics = () => {
  const timer = box(FieldResolutionMeter)
  mid(ResolveField)(resolve =>
    <F extends Field>((field: F) => {
      const next = resolve(field)
      return timedResolve
      function timedResolve(
        self: FieldThis<F>,
        args: FieldArgs<F>,
        ctx: FieldCtx<F>) {
        timer.for(ctx.request)
          .measure(field, this, [self, args, ctx])
      }
    })
  )
}
```

Reporting collected metrics via an agent:

```typescript
import {request, timing} from '@apollo/metrics'
import {resource, did} from '@apollo/core'
import ApolloAgent from '@apollo/agent'
import {request, timing} from '@apollo/metrics'
import {Execute} from '@apollo/server'

export const MetricsEndpoint =
  ref <string> `Metrics endpoint URL` ('https://default.url')

export default box `Apollo Graph Manager Metrics Agent` (() => {
  const url = read(MetricsEndpoint)
  const agent = resource `metrics agent at ${url}` (
    () => new ApolloAgent(url),  // acquire an agent
    agent => agent.close()       // release the agent
  )
  did(Execute)((response, [req]) => {
    const requests = request.for(req).try
    const timings = [...timing.for(req).try]
    agent.report({
      request: req,
      response,
      timings,
    })
    // We don't have to clean up here, because we only read from the box.
  })
})
```

There's no limit to how many reporting agents you can have.

### middleware

Execution middleware gives us a lot of power.

#### a safelist

```typescript
import { ref, plan, asSet, throws, box } from '@apollo/core'
import { midExecute } from '@apollo/server'

export const Allow = ref<string> `Allowed query` ()

export const E_SAFELIST_REJECT
  = throws('SAFELIST_REJECT', 'Query rejected by safelist')

const Safelist = plan `Safelist — permits only Allowed queries` (() => {
  // We could `read(Allow[asSet])` here, but then our middleware would
  // regenerate every time the allowed set changed.
  //
  // By putting it in a box, we close over the box instead, avoiding
  // the reflow.
  const allowed = box(Allow[asSet])

  midExecute(
    exec => request => {
      if (!allowed.contents.has(request.query))
        throw E_SAFELIST_REJECT()
      return exec(request.query)
    }
  )
})
```
#### APQ

#### Query complexity

### shimming existing lifecycle hooks

TK. Short answer is, we can implement all of them by having Parse, Validate,
and Execute refs, and by attaching `mid()`dleware to them:

  * server{Will/Did}Start
  * executionDid{Start,End}
  * parsingDidStart, parsingDidEnd
  * validationDidStart, parsingDidEnd
  * requestDidStart
  * didResolveOperation
  * didEncounterErrors
  * responseForOperation
      * short-circuits execution
  * willSendResponse


### query response caching
* partial?

### find all providers of X
* every declared datasource
* all resolvers
* sensibly call into other resolvers

### global config validation
* one resolver per field
* schema uses unknown directive
    * scan all directives

### pattern serialization?

### error recovery
* error boundaries
* suspense boundaries

### observability

TK. Not entirely sure how to demonstrate this without mockups. Will probably show how you can query for the data necessary to do:

* time travel
* chain of custody
  * timeline
* post-hoc stack traces
  * i.e. did something fail? even if we weren't tracking stack traces before, we
  can switch it on, re-evaluate, and collect them (assuming it *does* fail).
* part tree
  * like the React component tree, but for data flows in your server.

### things that do not work
* Lifting off inside async functions
  - like React, Liftoff functions must be sync
  - inside Liftoff, you can read() async values

  - You can `box()` up values to take out of Liftoff (into async land)
  - `box().for()` lets you get values
  -
* Keying bit
  - how we reconcile the set of calls when you re-call a function
  -

### a tracker app

Here's a project I was working on recently.

It's a public tracker that shows you people who are around you. The end goal is to be able to chat with them, but let's just talk about the tracker for now.

Here's the schema I want:

```graphql
type User {
  uid: String
  name: String
  avatarUrl: String
}

type Neighbor {
  user: User
  distance: Float
}

type Query {
  nearby(radius: Float): Neighbor[]
}

type Mutation {
  moveTo(lat: Float, lon: Float): Boolean
}
```

Here's query that feeds my frontend:

```graphql
@live
query Neighbors(radius: $meters) {
  me {
    nearby(radius: $meters) {
      user { name avatarUrl }
      distance
    }
  }
}
```

I'll use `moveTo` to set the location whenever I get an update from the OS.

I'm going to use Firestore as my backing database, and the GeoFirestore library to handle querying by location (GeoFirestore stores documents in Firestore along with a geohash, so it can do efficient radius queries.)

How do we write this with Apollo server? It's currently a pain. Even ignoring that we don't support `@live`, writing this as a subscription is quite irritating: I have to do a GeoQuery to get nearby users. Then, whenever I move, I have to set up another query and return its results. "Ashi, that's not so bad." But look: I don't want to send the whole list of users whenever I moved. Everyone is moving all the time, so that would make this effectively _n<sup>2</sup>_ rather than _n_, which could well be the difference between this thing working reliably and this thing working not at all, once more than a few people get onto it. It's very easy to do it wrong and provide a terrible experience, get a huge bill from Google, or both.

Right now, we don't have any way to make this easy for me, the app developer.

Liftoff makes it easy.

#### 1a. resolvers

First let's set up our database and types:

```typescript=
import * as firebase from 'firestore'
import { GeoFirestore } from 'geofirestore'

const db = firebase.firestore()
const geoDb = GeoFirestore(db)

export interface UserDoc {
  uid: string
  name: string
  avatarUrl: string
}

export interface TrackerDoc {
  uid: string
  coordinates: firebase.firestore.GeoPoint
}

export interface Neighbor {
  user: UserDoc
  distance: number
}

export const auth = firebase.auth()
export const users = db.collection('users')
export const tracker = geoDb.collection('tracker')
```

We'll set up some helper functions to query the database:

```typescript=27
// query<T>(q: firebase.Query | GeoQuery): Many<T>
//
// We'll look at the implementation later.
import {query} from './helpers'

// These functions give us typed responses from DB queries.
// It's like an ORM! Kindof! 😄
const queryTracker = (q: firebase.Query | GeoQuery) =>
  query<TrackerDoc>(q)

const queryUsers = (q: firebase.Query | GeoQuery) =>
  query<UserDoc>(q)
```


Now we can write resolvers:

```typescript=39
// Distance helper, gives us distance between two geopoints.
import {distance} from 'geofirestore'

function mustAuth() {
  const { currentUser } = auth
  if (!currentUser)
    throw new Error('Not logged in.')
  return currentUser
}

export const Mutation = {
  async moveTo(_, args: { lat: number, lon: number }) {
    const {uid} = mustAuth()
    await tracker.doc(auth.currentUser.uid)
      .set({ coordinates: new firebase.firestore.GeoPoint(lat, lon) })
    return true
  }
}

export const Query = {
  nearby(_, args: { radius: number }): Many<Neighbor> {
    const {uid} = mustAuth()
    const my = queryTracker(tracker.doc(uid)) [one]
    const center = read(my.coordinates)
    return queryTracker(
      tracker.nearby({ center, radius })
    )({
      user: neighbor => queryUsers(users.doc(neighbor.uid)),
      distance: neighbor => distance(center, neighbor.coordinates)
    })
  }
}
```

That's it.

#### 1b. What's this `Many` thing?

`Many<R>` is a synonym for `Pattern<R>`

Ok, what's a `Pattern`?

`Pattern<R>` is an immutable data structure that stores rows of type `<R>`. (Many rows, in point of fact.)

They're described in greater detail earlier in this doc. Generally, they have the collection operations you would expect—`[map]`, `[reduce]`, etc. Two features we're using on line 65:
  1. Patterns are functions, and calling them applies map. So we're applying map here.
  2. In addition to a function, map can take an object whose values are anything you can map. This _reshapes_ the input. So these lines map across the nearby users and reshape the pattern into the right form for us to return:

  ```typescript=65
    )({
      user: neighbor => queryUsers(users.doc(neighbor.uid)),
      distance: neighbor => distance(center, neighbor.coordinates)
    })
  ```

#### 1b. now make it live

It's already live.

#### 1c. what do you mean "it's already live"

These resolvers support `@live` queries as written.

#### 1d. what about the part where you `await my.coordinates`? What if we move?

We'll recompute the parts of the data flow that need to be recomputed, and send an update to the client.

#### 1e. but how?

Read on to [Liftoff from the ground up](#liftoff-from-the-ground-up)!

## From the ground up

### 1. remember me

There's this function, `remember`:

```typescript
function remember<F extends AnyFunc>(func: F): Memorized<F>
```

It takes a function and returns a _memo**r**ized_ version of it.

The memorized version works exactly like the old version. But now it has a side effect. See, there's this other function, `trace`:

```typescript
function trace(block: () => void): Memo
```

`trace` calls a block and captures every `Memorized` call that happens within its synchronous flow into a `Memo`. Don't worry about how just yet.

### 2. working `Memo`ry

With `remember` and `trace`, we can now do this:

```typescript=
interface SchemaDefinition {
  typeDefs: string
  resolvers: IResolvers
}
const Schema = remember(
  (definition: SchemaDefinition) => definition
)

const Directives = remember(
  (directives: Record<string, SchemaDirectiveVisitor>) => directives
)

import {SignedVisitor} from '@hypothetical/directives'

const memo = trace(() => {
  Schema({
    typeDefs: require('./users.gql'),
    resolvers: require('./users.resolve'),
  })
  Schema({
    typeDefs: require('./schema.gql'),
    resolvers: require('./schema.resolve'),
  })
  Directives({ signed: SignedVisitor })
})
```

What we've done here is turned code into data. The `memo` returned by `trace` stores a record of all `remember`ed calls. Specifically, it stores a `Call` for each one, which looks like this:

```typescript=
interface Call<F extends AnyFunc> {
  func: F
  args: Parameters<F>
  result: Result<F>
  parent?: Call<AnyFunc>
}

type Result<F extends AnyFunc> = Returned<F> | Threw<F>

interface Returned<F extends AnyFunc> {
  type: 'returned'
  value: ReturnType<F>
}

interface Threw<F> {
  type: 'threw'
  error: Error
}
```

### 3. partial recall

`Memo` is a `Pattern<Call>`. `Pattern<R>`[^r-for-row] has a query interface. The actual typings are a bit complex so we'll get to them later, but here's how we can use it.

[^r-for-row]: The `<R>` is for `R`ow.

Let's say we want to compile an executable schema. We can do it like this:

```typescript=22
function compileSchema(memo: Memo) {
  const merged = memo
    [map](call =>
      (call.func === Schema && call.result.type === 'returned')
        ? call.result.value
        : undefined)
    [reduce](mergeSchemas)
    [value]()

  const schemaDirectives = memo
    [map](call =>
      (call.func === Directives && call.result.type === 'returned')
        ? call.result.value
        : undefined)
    [reduce]((all, these) => ({ ...all, ... these}))
    [value]()

  return makeExecutableSchema({
    ...merged,
    schemaDirectives
  })
}
```

(It's `[map]` and `[reduce]` rather than `.map` and `.reduce` because—for reasons we'll see later—`Pattern`'s query operations are defined as symbols.)

That thing where we get the return value of all calls of a certain type? Seems like we might be doing that one a lot. Let's break it out into a function:

```typescript=22
const returned = <F>(func: F) =>
  (call: Call<any>) =>
    (call.func === func && call.result.type === 'returned')
      ? call.result.value
      : undefined
```

So now we can do:

```typescript=23
  const merged =
    memo
      [map](returned(Schema))
      [reduce](mergeSchemas)
      [value]()

  const schemaDirectives =
    memo
      [map](returned(Directives))
      [reduce]((all, these) => ({ ...all, ... these}))
      [value]()
```

Note that these come out correctly typed[^why-correctly-typed]. Typescript infers:

```typescript=23
const merged: { typeDefs: string, resolvers: IResolvers } =
  memo
    [map](returned(Schema))
    [reduce](mergeSchemas)
    [value]()

const schemaDirectives: { [name: string]: SchemaDirectiveVisitor } =
  memo
    [map](returned(Directives))
    [reduce]((all, these) => ({ ...all, ... these}))
    [value]()
```

[^why-correctly-typed]: The typings work out because: (1) `Call<F>` is parameterized in `F`—its `args` field is of type `Parameters<F>` and `Returns<F>['value']` is of type `ReturnType<F>` and (2) `[map](project: P)` returns a `Pattern` of the `ReturnType<P>`, excluding `undefined` (rows where `project` returns `undefined` are excluded from the pattern). `memo[map](funcIs(Schema))` therefore gives us a `Pattern<Call<Schema>>`, with the return type and arg types well-defined.

### 4. a spoonful of sugar

#### 4a. Queen `[map]`

`[map]` is, like, _super useful_. Turns out we don't have to keep typing it. `Pattern`s are _functions_. They do what `[map]` does. So now:

```typescript=23
const merged =
  memo(returned(Schema))
    [reduce](mergeSchemas)
    [value]()

const schemaDirectives =
  memo(returned(Directives))
    [reduce]((all, these) => ({ ...all, ... these}))
    [value]()
```

Have we killed `[map]`? Far from it. She has become so pervasive that speaking her name is unnecessary. She is the Queen of Patterns.

#### 4b. project yourself

Following her coronation, `[map]` reveals new powers:

Of course she knows what to do with functions:

```typescript
memo(call => call.result)
```

She can also take strings (and symbols). Specifically, any `keyof R`:

```typescript
memo('result')
```

This is shorthand for:

```typescript
memo[map](call => call.result)
```

Which extracts the field, giving us in this case a `Pattern<Result>`.

This is but a taste of her shaping abilities.

We can pass in an object whose values are anything we can map. That means any `keyof R`…

```typescript
memo({ func: 'func', finished: 'result' })
```

…any projection function…

```typescript
memo({ func: 'func', isOk: call => call.result.type === 'returned' })
```

…and, of course, other objects:

```typescript
memo({
  finished: 'result',
  call: {
    ok: call => call.result.type === 'returned'
    arguments: 'args',
    function: 'func',
  }
})
```

These we call things that can be passed to map _projectors_. Another kind of projector is any object with a `[project]` property. If present, map will use that..

```typescript
memo({
  [project]: 'result'
})
```

Which maybe seems not so useful until I mention that `[project]` is map's Grand Vizier, who she will listen to above all else. If a function has `[project]` defined, map will not call the function as usual, and will instead use `[project]`.

So let's upgrade our `Schema` and `Directives`. We can use this helpful `makeProjector`[^make] function:
[^make]: A little convention I like is that functions start with `make` if they mutate their input to give it new powers.

```typescript
const Schema = makeProjector(
  remembered(
    (definition: SchemaDefinition) => definition
  ),
  returned(Schema)
)

const Directives = makeProjector(
  remembered(
    (directives: Record<string, SchemaDirectiveVisitor>) => directives
  ),
  returned(Directives)
)
```

Now schema composition becomes:

```typescript=23
const merged = memo(Schema)
  [reduce](mergeSchemas)
  [value]

const schemaDirectives = memo(Directives)
  [reduce]((all, these) => ({ ...all, ... these }))
  [value]
```

#### 4c. `ref`er madness

`Schema` and `Directives` are queer sorts of functions. They're `remember`ed identity functions which project their returned value. It's like their only job in life is to refer to those values. That's why this helper is named `ref`:

```typescript
function ref<T>(input: Source<T> = (value: T) => value) {
  if (typeof input === 'function') {
    const output =
      makeProjector(remembered(input), returned(output))
    return output
  }
  // ...
  // There's more down here, we'll get to it.
}

type Source<T> = T | (...args: any[]) => T
```

So we can write:

```typescript
const Schema = ref((definition: SchemaDefinition) => definition)
const Directives = ref(
  (directives: Record<string, SchemaDirectiveVisitor>) => directives
)
```

Or just:

```typescript
const Schema = ref<SchemaDefinition>()
const Directives = ref<Record<string, SchemaDirectiveVisitor>>()
```

We have to specify `<T>` explicitly here, because Typescript unfortunately can't infer type information from nothing. (Goddamnit, Typescript.)

You may have noticed from the type of `Source` that `ref` can take a value:


```typescript
const MaxConcurrentQueries = ref(1024)
```

In addition to letting us infer the type, this value also becomes the default value, which what ref projects if you map it and it's never been successfully defined. It does this with the hitherto unknown `[ifEmpty]` op (line 12):

```typescript=
function ref<T>(input: Source<T> = (value: T) => value) {
  if (typeof input === 'function') {
    const output =
      makeProjector(
        remembered(input),
        returned(output))
    return output
  }

  const withDefault = makeProjector(
    remembered((value: T = input) => value),
    returned(withDefault)[ifEmpty](value))
  return withDefault
}
```

#### 4d. a little of column a

Here's a fun thing you can do:

```typescript
memo(Schema).resolvers.User
```

This behaves how you'd expect. It's synonymous with:

```typescript
memo(Schema)('resolvers')('User')
```

But. But how.

Well,

```typescript
interface Pattern<R> implements Columns<R>
```

Where:
```typescript
type Columns<R> = {
  [K in keyof R]: Pattern<Exclude<R[K], undefined>>
}
```

This is why ops like `[map]` are symbols—it keeps the `Pattern` namespace clear, so you can dot into your columns.

(Perhaps you have questions about the runtime how of this.)

#### 4e. call me maybe

Descending into patterns is interesting because you'll eventually get down to methods. Like:

```typescript
memo(Schema).resolvers.User.name
```

We can't just call it, because of course it's a `Pattern<Resolver>`, not a resolver itself. But that's okay, we can just map to get the same result:

```typescript
memo(Schema).resolvers.User.name(name => name({ uid: 0 }))
```

Which gives us a `Pattern<string>`. Seems like that trick might be useful later on.

### 5. god is change

This is all very nice.

But what happens when some piece of our configuration changes? Say we receive a Schema update. Is there any way we can push that into our system?

I'm asking because I know the answer, and the answer is yes.

Let's first tweak our config to mark the schema that's going to change:

```typescript=11
const UpdateMe = makeProjector(
  remembered(<T>(value: T) => value),
  call => call.func === UpdateMe ? call : undefined
)

const memo = trace(() => {
  Schema({
    typeDefs: require('./users.gql'),
    resolvers: require('./users.resolve'),
  })
  Schema(
    UpdateMe({
      typeDefs: require('./schema.gql'),
      resolvers: require('./schema.resolve'),
    })
  )
  Directives({ signed: SignedVisitor })
})
```

[^why-not-ref]: If `UpdateMe` is a `remember`ed identity function, isn't it just a `ref`? Not quite. `ref`'s type parameter is on the outside—that is, `type Ref<T> = (input: Source<T>) => T`. `UpdateMe`'s type would be `type UpdateMe = <T>(input: T) => T`. Another way to think about this: if we made `UpdateMe` a ref, we would need to specify its data type when we define it, so it would only work on e.g. Schemas. This way, `UpdateMe` is generic, and can wrap any kind of data.

Note that `UpdateMe` is the typed identity function[^why-not-ref]. It doesn't do anything. But it is `remember`ed, so calls to it will show up in the `memo`. We can find the update point like so:

```typescript
memo(UpdateMe)
```

So say we get a schema update (through whatever mechanism).

We first get the updated version of the rows that need to change:

```typescript
const updateSchema = (memo: Memo, schemaUpdate: SchemaDefinition) =>
  memo(UpdateMe)
    (call => ({
      ...call,
      result: { type: 'returned', value: schemaUpdate }
    }))
```

Notice that we're using `Result`'s property here. Knew that would come in handy.

Now we want to get the original memo, but with these rows changed.

We can use the `change` function for that:

```typescript
function change<R>(memo: Pattern<R>): Change<R>

interface Change<R> {
  readonly now: Pattern<R>
  update<U>(rows: Pattern<U>): Change<R | U | R & U>
  hasChanged(rows?: Pattern<any>): boolean
}
```

Which lets us create the new memo like this:

```typescript
const nextMemo = change(memo).update(updateSchema(memo, schemaUpdate)).now
```

But we need to do more. This `nextMemo` won't actually have any updates to `Schema`. Why not? We updated the return value of the `UpdateMe` call, but not the call to `Schema` that uses it. The `memo` doesn't actually know that there's a connection between `UpdateMe` and `Schema`'s return values. That information is stored in the closure of `UpdateMe`'s parent call. Which we also have.

We need to jump back into it. _Go back in time_. Only this time it'll be different. This time, `UpdateMe` will return the updated value.

Pleasantly, `trace` knows how to do this too:

```typescript
function trace(change: Change<Call>): Change<Call>
```

Called with a `Change<Call>`, `trace` will look up the parent `Call`s of all the rows altered in `change`, figure
out how to call them (it has `func`, `thisValue`, and `args`—everything we need), and then do it, re-tracing their `remember`ed calls as it is uniquely qualified to do.

You may have figured this out already, but _memo**r**ized_ functions are also, in fact, _memoized_. If a `remember`ed function is called while tracing a change, it finds its previous `Call` in the memo and finishes with that value, returning or throwing as appropriate.

By changing the memo, we change the function's future.

```typescript
const memoWithNewSchema = trace(
  change(memo).update(updateSchema(memo, schemaUpdate))
).now
```

Now we can compile our new schema:

```typescript
const newSchema = compileSchema(memoWithNewSchema)
```

### 7. self-injection

It's frustrating that we have to call `compileSchema` again to get the new schema—that we have to remember to do this, what with everything else going on in our lives.

What would be great is if we could put `compileSchema` into the memo. Then it would just update itself. But `compileSchema` uses the memo, so how can we put it into the memo?

Well, we know how to change the return value of a function and re-run whatever needs to be changed. So we'll do that.

First, let's generalize `updateSchema`, so it writes to any ref:

```typescript
const write = <T>(memo: Memo, ref: (...args: any) => T, data: T) =>
  memo(ref)
    (call => ({
      ...call,
      result: { type: 'returned', value: data }
    }))
```

Now we use it:

```typescript=12
const lastMemo = makeProjector(
  remembered(<T>(value: T) => value),
  call => call.func === lastMemo ? call : undefined
)
const ExecutableSchema = ref<GraphQLExectutableSchema>()

const plan = () => {
  Schema({
    typeDefs: require('./users.gql'),
    resolvers: require('./users.resolve'),
  })
  Schema(
    UpdateMe({
      typeDefs: require('./schema.gql'),
      resolvers: require('./schema.resolve'),
    })
  )
  Directives({ signed: SignedVisitor })
  ExecutableSchema(compileSchema(lastMemo()))
}

function run(block: () => void) {
  let memo = trace(block)
  do {
    const change =
      change(memo).update(write(memo, lastMemo, memo))
    memo = change.now
  } while (change.hasChanged())
  return memo
}
```

`Empty` returns an empty pattern, which we use to initialize `lastMemo`.

### 8. keep me in suspense

tk

### 9. who are you, again and again?

tk

### 10. what have we built?

tk
