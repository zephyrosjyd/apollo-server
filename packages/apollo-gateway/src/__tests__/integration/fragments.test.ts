import gql, { disableFragmentWarnings } from 'graphql-tag';
import { execute } from '../execution-utils';
import * as accounts from '../__fixtures__/schemas/accounts';
import * as books from '../__fixtures__/schemas/books';
import * as inventory from '../__fixtures__/schemas/inventory';
import * as product from '../__fixtures__/schemas/product';
import * as reviews from '../__fixtures__/schemas/reviews';

import { astSerializer, queryPlanSerializer } from '../../snapshotSerializers';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

beforeAll(() => {
  disableFragmentWarnings();
});
it('supports inline fragments (one level)', async () => {
  const query = gql`
    query GetUser {
      me {
        ... on User {
          username
        }
      }
    }
  `;

  const { data, queryPlan } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
    },
  );

  expect(data).toEqual({
    me: {
      username: '@ada',
    },
  });

  expect(queryPlan).toCallService('accounts');
});

it('supports inline fragments (multi level)', async () => {
  const query = gql`
    query GetUser {
      me {
        ... on User {
          username
          reviews {
            ... on Review {
              body
              product {
                ... on Product {
                  ... on Book {
                    title
                  }
                  ... on Furniture {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const { data, queryPlan, errors } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
    },
  );

  expect(data).toEqual({
    me: {
      username: '@ada',
      reviews: [
        { body: 'Love it!', product: { name: 'Table' } },
        { body: 'Too expensive.', product: { name: 'Couch' } },
        { body: 'A classic.', product: { title: 'Design Patterns' } },
      ],
    },
  });

  expect(queryPlan).toCallService('accounts');
  expect(queryPlan).toCallService('reviews');
  expect(queryPlan).toCallService('product');
  expect(queryPlan).toCallService('books');
});

it('supports named fragments (one level)', async () => {
  const query = gql`
    query GetUser {
      me {
        ...userDetails
      }
    }

    fragment userDetails on User {
      username
    }
  `;

  const { data, queryPlan } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
    },
  );

  expect(data).toEqual({
    me: {
      username: '@ada',
    },
  });

  expect(queryPlan).toCallService('accounts');
});

it('supports multiple named fragments (one level, mixed ordering)', async () => {
  const query = gql`
    fragment userInfo on User {
      name
    }
    query GetUser {
      me {
        ...userDetails
        ...userInfo
      }
    }

    fragment userDetails on User {
      username
    }
  `;

  const { data, queryPlan } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
    },
  );

  expect(data).toEqual({
    me: {
      username: '@ada',
      name: 'Ada Lovelace',
    },
  });

  expect(queryPlan).toCallService('accounts');
});

it('supports multiple named fragments (multi level, mixed ordering)', async () => {
  const query = gql`
    fragment reviewDetails on Review {
      body
    }
    query GetUser {
      me {
        ...userDetails
      }
    }

    fragment userDetails on User {
      username
      reviews {
        ...reviewDetails
      }
    }
  `;

  const { data, queryPlan } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
    },
  );

  expect(data).toEqual({
    me: {
      reviews: [
        { body: 'Love it!' },
        { body: 'Too expensive.' },
        { body: 'A classic.' },
      ],
      username: '@ada',
    },
  });

  expect(queryPlan).toCallService('accounts');
});

it('supports variables within fragments', async () => {
  const query = gql`
    query GetUser($format: Boolean) {
      me {
        ...userDetails
      }
    }

    fragment userDetails on User {
      username
      reviews {
        body(format: $format)
      }
    }
  `;

  const format = true;
  const { data, queryPlan } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
      variables: { format },
    },
  );

  expect(data).toEqual({
    me: {
      username: '@ada',
      reviews: [
        { body: 'Love it!' },
        { body: 'Too expensive.' },
        { body: 'A classic.' },
      ],
    },
  });

  expect(queryPlan).toCallService('accounts');
  expect(queryPlan).toCallService('reviews');
});

it('supports root fragments', async () => {
  const query = gql`
    query GetUser {
      ... on Query {
        me {
          username
        }
      }
    }
  `;

  const { data, queryPlan } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
    },
  );

  expect(data).toEqual({
    me: {
      username: '@ada',
    },
  });

  expect(queryPlan).toCallService('accounts');
});

it('resolves fragments on interfaces (TODO - more detail / describe this better)', async () => {
  const query = gql`
    query TopCars {
      topCars {
        ... on Product {
          upc
          sku
          name
          price
        }
      }
    }
  `;

  const { data, errors, queryPlan } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
    },
  );

  expect(errors).toMatchInlineSnapshot(`
    Array [
      [GraphQLError: Fragment cannot be spread here as objects of type "Car" can never be of type "Book".],
      [GraphQLError: Fragment cannot be spread here as objects of type "Car" can never be of type "Furniture".],
    ]
  `);

  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            topCars {
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                upc
                sku
                name
                price
              }
            }
          }
        },
        Flatten(path: "topCars.@") {
          Fetch(service: "books") {
            {
              ... on Book {
                __typename
                isbn
              }
            } =>
            {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            }
          },
        },
        Flatten(path: "topCars.@") {
          Fetch(service: "product") {
            {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            } =>
            {
              ... on Book {
                upc
                sku
                name
                price
              }
            }
          },
        },
      },
    }
  `);
});

it('resolves fragments on interfaces (nested) (TODO - more detail / describe this better)', async () => {
  const query = gql`
    query TopProducts {
      topProducts {
        ... on Downloadable {
          url
          # ... on Product ?
        }
        name
        # ... on Product ?
      }
    }
  `;

  const { data, errors, queryPlan } = await execute(
    [accounts, books, inventory, product, reviews],
    {
      query,
    },
  );

  expect(errors).toMatchInlineSnapshot(`
    Array [
      [GraphQLError: Fragment cannot be spread here as objects of type "Product" can never be of type "UserManual".],
    ]
  `);

  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Sequence {
        Fetch(service: "product") {
          {
            topProducts {
              __typename
              ... on App {
                url
                name
              }
              ... on AudioBook {
                url
                name
              }
              ... on UserManual {
                url
              }
              ... on Book {
                __typename
                isbn
              }
              ... on Furniture {
                name
              }
            }
          }
        },
        Flatten(path: "topProducts.@") {
          Fetch(service: "books") {
            {
              ... on Book {
                __typename
                isbn
              }
            } =>
            {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            }
          },
        },
        Flatten(path: "topProducts.@") {
          Fetch(service: "product") {
            {
              ... on Book {
                __typename
                isbn
                title
                year
              }
            } =>
            {
              ... on Book {
                name
              }
            }
          },
        },
      },
    }
  `);
});
