import gql from 'graphql-tag';
import { astSerializer, queryPlanSerializer } from '../../snapshotSerializers';
import { execute } from '../execution-utils';

expect.addSnapshotSerializer(astSerializer);
expect.addSnapshotSerializer(queryPlanSerializer);

it('reproduction', async () => {
  const query = gql`
    query Article($id: String!) {
      article(id: $id) {
        __typename
        sprinkledBody {
          content {
            __typename
            ...SlideshowBlock
            ...AudioBlock
          }
        }
      }
    }

    fragment SlideshowBlock on SlideshowBlock {
      media {
        slides {
          slug
          url
        }
      }
    }

    fragment Audio on Audio {
      firstPublishedTimezoneOffset
    }

    fragment AudioBlock on AudioBlock {
      media {
        ...Audio
      }
    }
  `;

  const { data, queryPlan, errors } = await execute(
    [
      {
        name: 'service',
        typeDefs: gql`
          extend type Query {
            article(id: String!): Article
          }

          type Article @key(fields: "uri") {
            uri: String!
            sprinkledBody: DocumentBlock
          }

          type DocumentBlock {
            content: [BlockUnion]!
          }

          union BlockUnion = SlideshowBlock | AudioBlock

          type SlideshowBlock {
            size: Size!
            media: Slideshow
          }

          enum Size {
            MEDIUM
            SMALL
            LARGE
            FULL
          }

          type Slideshow @key(fields: "uri") {
            uri: String!
            slides: [SlideshowSlide]!
          }

          type SlideshowSlide {
            url: String!
            #image:Image
            slug: String!
          }

          type Audio @key(fields: "uri") {
            uri: String!
            firstPublishedTimezoneOffset: String
          }

          type AudioBlock {
            media: Audio
          }
        `,
        resolvers: {
          Query: {
            article(_, { id }) {
              id;
              return null;
            },
          },
        },
      },
    ],
    { query },
  );

  expect(data).toMatchInlineSnapshot(`undefined`);
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Fetch(service: "service") {
        {
          article(id: $id) {
            __typename
            sprinkledBody {
              content {
                __typename
                ... on SlideshowBlock {
                  __typename
                  media {
                    slides {
                      slug
                      url
                    }
                  }
                }
                ... on AudioBlock {
                  __typename
                  media {
                    slides {
                      slug
                      url
                    }
                  }
                }
              }
            }
          }
        }
      },
    }
  `);

  expect(errors).toMatchInlineSnapshot(`
    Array [
      [GraphQLError: Cannot query field "slides" on type "Audio".],
    ]
  `);
});

it('minimal', async () => {
  const query = gql`
    query Article($id: String!) {
      union {
        ...Foo
        ...Bar
      }
    }

    fragment Foo on Foo {
      nested {
        thing
      }
    }

    fragment Bar on Bar {
      nested {
        stuff
      }
    }
  `;

  const { data, queryPlan, errors } = await execute(
    [
      {
        name: 'minimal',
        typeDefs: gql`
          extend type Query {
            union: MyUnion
          }

          union MyUnion = Foo | Bar

          type Foo {
            nested: Thing
          }

          type Thing {
            thing: String
          }

          type Bar {
            nested: Stuff
          }

          type Stuff {
            stuff: String
          }
        `,
        resolvers: {
          Query: {},
        },
      },
    ],
    { query },
  );

  expect(data).toMatchInlineSnapshot(`undefined`);
  expect(queryPlan).toMatchInlineSnapshot(`
    QueryPlan {
      Fetch(service: "minimal") {
        {
          union {
            __typename
            ... on Foo {
              thing {
                thing
              }
            }
            ... on Bar {
              stuff {
                stuff
              }
            }
          }
        }
      },
    }
  `);

  expect(errors).toMatchInlineSnapshot(`undefined`);
});
