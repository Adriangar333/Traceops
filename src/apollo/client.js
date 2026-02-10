import { ApolloClient, InMemoryCache, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

const getBaseUrl = () => {
    const url = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || 'https://dashboard-backend.zvkdyr.easypanel.host';
    return url.replace(/\/api$/, ''); // Ensure no trailing /api if it exists, though GraphQL usually is at root/graphql or api/graphql
};

const httpLink = createHttpLink({
    uri: `${getBaseUrl()}/graphql`,
});

const authLink = setContext((_, { headers }) => {
    // get the authentication token from local storage if it exists
    const token = localStorage.getItem('token');
    // return the headers to the context so httpLink can read them
    return {
        headers: {
            ...headers,
            authorization: token ? `Bearer ${token}` : "",
        }
    }
});

const client = new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache({
        typePolicies: {
            SCRCOrder: {
                fields: {
                    evidence: {
                        merge(existing, incoming) {
                            return incoming;
                        }
                    }
                }
            }
        }
    })
});

export default client;
