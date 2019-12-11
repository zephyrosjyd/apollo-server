# Liftoff

## From above

### 1. configuring a server

```typescript
import {ambient, todo} from './directives'

Apollo(() => {
  Schema({
    typeDefs: require('./schema.gql'),
    resolvers: require('./schema'),
  })

  Directives({ ambient, todo })
})
```

### 2. schema modules

```typescript=
// schema-modules/admin.ts

import {Schema} from 'apollo-server'
import {ambient} from './directives'
import typeDefs from './admin.gql'
import resolvers from './admin.resolver'

export default () => {
  Schema({
    typeDefs, resolvers
  })
  Directives({ambient})
}
```

Other modules are similar.

```typescript=
// main.ts

import {ambient, todo} from './directives'
import {Directives} from 'apollo-server'
import User from './schema-modules/user'
import Documents from './schema-modules/documents'
import Admin from './schema-modules/admin'

Apollo(() => {
  Admin()
  User()
  Documents()
  Directives({ todo })
})
```

### 3. merging schema modules

How does the server pull together all those `Schema` and `Directives` calls into an executable schema? Like this:

```typescript
const ExecutableSchema = ref(() => {
  const merged = all(Schema)
    [reduce](mergeSchemas)
    [value]

  const schemaDirectives = all(Directives)
    [reduce]((all, these) => ({ ...all, ... these }))
    [value]

  return makeExecutableSchema({
    ...merged,
    schemaDirectives
  })
})
```

### 4. dynamic config updates

```typescript
import {go, read, source} from 'apollo-server'
import * as supported from './directives'

const poll = remember((url: Source<string>, ms: Source<number> = 1000) => {
  const [source, sink] = pipe<any>()
  // go declares an an effect
  // it reboots when its dependencies change.
  //   these    👇🏽          👇🏽 are its dependencies
  go `polling ${url} every ${ms}ms` (() => {
    const iv = setInterval(async () => sink(await getJson(url)), ms)
    return () => clearInterval(iv)
  })
  return source
})

function GatewayConfig() {
  // read(source) blocks until source emits a value, then re-returns with
  // every subsequent value.
  const config = read(poll(GATEWAY_CONFIG_URL))
  Schema(config.schema)
  Many(config.enabledDirectives)
    (
      enabled =>
        enabled in supported
          ? { [enabled]: supported[enabled] }
          : undefined
    )
    [condensed]
}
```

### 5. metrics

### 6. execution middleware

### 7. a tracker app

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
  async nearby(_, args: { radius: number }): Many<Neighbor> {
    const {uid} = mustAuth()
    const my = queryTracker(tracker.doc(uid)) [one]
    const center = await my.coordinates
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

Here's what happens:

1. We call `queryTracker`, which returns a `Many<TrackerDoc>`.
2. We get the `[one]` row within that `Many<TrackerDoc>`, which returns `One<TrackerDoc>`. This behaves almost exactly like `Many<TrackerDoc>`, except for what happens when we `await` it, as we'll do in a moment.
3. Given that, `my.coordinates` might seem very suspicious. But `One<R>` has all the fields of `R`, but hoisted into patterns themselves. So `my.coordinates` is `One<GeoPoint>`.
4. When we await `my.coordinates` the first time, JS calls `my.coordinates.then`, which returns a `Promise<GeoPoint>`, which we `await` as usual.
5. Run the rest of the pipeline, return the resulting `Many<Neighbor>`. We're assuming that the server machinery can pick this up and return whatever it needs to the client, which seems a fair assumption.

But then, your location changes (because you called `moveTo`). How on earth does that propagate?

If you haven't read [the ground up section](#liftoff-from-the-ground-up) above, now might be the time.

6. First of all, Firestore is doing some work for us. It'll call a listener after the mutation occurs. When that listener gets called, it'll dispatch a change to the memo. That change will say: `my.coordinates.then` should return something else now. Specifically, it should return the updated value.
7. The run loop will apply that change, and re-trace the parent `Call`s of `my.coordinates.then`.
8. That'll cause our resolver call to return a new value, so we re-trace its parents, all the way up the stack, until we get to the part of the server that's going to send the response.
9. That part of the server calls `delta(result)`, which returns the changed rows of any pattern. That's what it sends to the client.

#### 1x. why not React?

If I could do this on the frontend, I might ditch GraphQL (I know) and just use Firestore and React:

```typescript
const db = GeoFirestore(app.firestore().db())
const users = db.collection('users')

const Tracker = (props: { radius: number, children: any }) => {
  const uid = useUid()
  const location = useLocation()
  useEffect(() => {
    users.doc(uid).update({ location })
  }, [location, uid])
  const query = useMemo(() => users.near({ center: location, radius }),
    [location, radius])
  const nearby = useGeoQuery(query)
  return children(nearby)
}
```

Issues:

  1. I can't do this on the frontend. I don't want to reveal users' actual locations to each other—just their distances. This is a hard product requirement: even though, yes, there are privacy implications to revealing your distance, revealing your actual lat/lon coordinates to anyone who asks is worse.
  2. **This is still n<sup>2</sup>!! asdfjk#!$@#!!** Why? To move the center of the query, you have to create a new query. So `query` will change. So `useGeoQuery` will request a new snapshot, with a full set of all the changed data. Only now everything is getting sent to the frontend for processing, so it's worse.
  3. Other parts of the API are going to be in GraphQL, and gosh it would be nice to just have one API in my frontend code. That's like literally the whole point of our company, right?

So let's do this in GraphQL.




```typescript=
function plan() {
  const count: number = read(
    async function *getData(): number {
      yield await 1
      yield await 2
      yield await 3
    }, 0)
  const serviceName: string = read(
    async function *getLabel(): string {
      while(true) {
        yield await fetch(SERVICE_NAME_URL).text
      }
    },
  )
  return serviceName + number + 1
}
```

```typescript=
const User = {
  name(user: { uid: string }) {
    return source<string>(emit =>
            db.collection('users')
                .doc(uid)
                .onSnapshot(snap => emit(snap.val().name))
        )
  },
  feed(user: { uid: string }, _, ctx) {
    const name = lastMemo()(ExecutableSchema)
      .User.name(name => name(user), {}, ctx)
    const feed = source<string[]>(emit =>
      db.collection('feeds').doc(uid)
        .onSnapshot(snap => emit(snap.val().items))
    )
    return feed.map(item => processTemplate(item, {name}))
  }
}
```

```typescript
const and = remembered((x: boolean, y: boolean) => x && y)

const input0 = ref(false)
const output = ref()
run(() => {
  const input1 = source<boolean>(async function flip*() {
    let value = true
    while (true) {
      emit(value)
      value = !value
      await sleep(10)
    }
  }, false)

  output(and(input0, input1))
})
```


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

In addition to letting us infer the type, this value also becomes the default value, which what ref projects if you map it and it's never been successfully defined. It does this with the hitherto unknown `[ifEmpty]` op:

```typescript
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

### 8. don't keep me in suspense

tk

### 9. who are you, again and again?

tk

### 10. what have we built?

tk
