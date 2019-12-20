import {
  GraphQLRequestContext,
  GraphQLResponse,
  ValueOrPromise,
} from 'apollo-server-types';
import {
  ApolloError,
  AuthenticationError,
  ForbiddenError,
} from 'apollo-server-errors';
import {
  fetch,
  Request,
  Headers,
  Response,
} from 'apollo-server-env';
import { isObject } from '../utilities/predicates';
import { GraphQLDataSource } from './types';
import createSHA from 'apollo-server-core/dist/utils/createSHA';

export class RemoteGraphQLDataSource implements GraphQLDataSource {
  constructor(
    config?: Partial<RemoteGraphQLDataSource> &
      object &
      ThisType<RemoteGraphQLDataSource>,
  ) {
    if (config) {
      return Object.assign(this, config);
    }
  }

  url!: string;

  async process<TContext>({
    request,
    context,
  }: Pick<GraphQLRequestContext<TContext>, 'request' | 'context'>): Promise<
    GraphQLResponse
  > {
    // Respect incoming http headers (eg, apollo-federation-include-trace).
    const headers = (request.http && request.http.headers) || new Headers();
    headers.set('Content-Type', 'application/json');

    request.http = {
      method: 'POST',
      url: this.url,
      headers,
    };

    if (this.willSendRequest) {
      await this.willSendRequest({ request, context });
    }

    if (!request.query) {
      throw new Error("Missing query");
    }

    const apqHash = createSHA('sha256')
       .update(request.query)
       .digest('hex');

    const graphqlRequestApqOptimistic: Omit<typeof request, 'query'> = {
      operationName: request.operationName,
      variables: request.variables,

      // Take the original extensions and extend them with
      // the necessary APQ extension for the APQ handshaking.
      extensions: {
        ...request.extensions,
        persistedQuery: {
          version: 1,
          sha256Hash: apqHash,
        },
      },
    };

    const httpRequestApqOptimistic = new Request(request.http.url, {
      ...request.http,
      body: JSON.stringify(graphqlRequestApqOptimistic),
    });

    try {
      const httpResponseApqOptimistic = await fetch(httpRequestApqOptimistic);

      const bodyApqOptimistic = await this.didReceiveResponse<
        Partial<GraphQLResponse>
      >(httpResponseApqOptimistic, httpRequestApqOptimistic, context);

      if (!isObject(bodyApqOptimistic)) {
        throw new Error(
          `Expected JSON response body, but received: ${bodyApqOptimistic}`);
      }

      // If we didn't receive notice to retry with APQ, then let's
      // assume this is the best result we'll get and return it!
      if (
        !bodyApqOptimistic.errors ||
        !bodyApqOptimistic.errors.find(error =>
          error.message === 'PersistedQueryNotFound')
      ) {
        return {
          ...bodyApqOptimistic,
          http: httpResponseApqOptimistic,
        };
      }

      // Run the same request again, but add in the previously omitted `query`.
      const httpRequestApqMiss = new Request(request.http.url, {
        ...request.http,
        body: JSON.stringify({
          ...graphqlRequestApqOptimistic,
          query: request.query,
        }),
      });
      const httpResponseApqMiss = await fetch(httpRequestApqMiss);
      const bodyApqMiss = await this.didReceiveResponse<Partial<GraphQLResponse>>(
        httpResponseApqMiss,
        httpRequestApqMiss,
        context,
      );

      if (!isObject(bodyApqMiss)) {
        throw new Error(
          `Expected JSON response body, but received: ${bodyApqMiss}`);
      }

      return {
        ...bodyApqMiss,
        http: httpResponseApqOptimistic,
      };
    } catch (error) {
      this.didEncounterError(error, httpRequestApqOptimistic);
      throw error;
    }
  }

  public willSendRequest?<TContext>(
    requestContext: Pick<
      GraphQLRequestContext<TContext>,
      'request' | 'context'
    >,
  ): ValueOrPromise<void>;

  public async didReceiveResponse<TResult = any, TContext = any>(
    response: Response,
    _request: Request,
    _context?: TContext,
  ): Promise<TResult> {
    if (response.ok) {
      return (this.parseBody(response) as any) as Promise<TResult>;
    } else {
      throw await this.errorFromResponse(response);
    }
  }

  public didEncounterError(error: Error, _request: Request) {
    throw error;
  }

  public parseBody(response: Response): Promise<object | string> {
    const contentType = response.headers.get('Content-Type');
    if (contentType && contentType.startsWith('application/json')) {
      return response.json();
    } else {
      return response.text();
    }
  }

  public async errorFromResponse(response: Response) {
    const message = `${response.status}: ${response.statusText}`;

    let error: ApolloError;
    if (response.status === 401) {
      error = new AuthenticationError(message);
    } else if (response.status === 403) {
      error = new ForbiddenError(message);
    } else {
      error = new ApolloError(message);
    }

    const body = await this.parseBody(response);

    Object.assign(error.extensions, {
      response: {
        url: response.url,
        status: response.status,
        statusText: response.statusText,
        body,
      },
    });

    return error;
  }
}
