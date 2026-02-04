const { ApolloServer } = require('@apollo/server');
const typeDefs = require('./schema');
const resolvers = require('./resolvers');
const createLoaders = require('./loaders/dataLoaders');

/**
 * Creates and configures the Apollo GraphQL Server
 * @returns {ApolloServer} Apollo server instance
 */
const createApolloServer = () => {
    return new ApolloServer({
        typeDefs,
        resolvers,
        formatError: (error) => {
            console.error('GraphQL Error:', error);
            return {
                message: error.message,
                code: error.extensions?.code || 'INTERNAL_ERROR',
                path: error.path
            };
        },
        introspection: true
    });
};

/**
 * Context function to inject DataLoaders and DB pool into resolvers
 * @param {Object} pool - PostgreSQL connection pool
 * @returns {Function} Async context function
 */
const createContext = (pool) => async (req) => {
    return {
        db: pool,
        loaders: createLoaders(pool),
        user: req?.user || null
    };
};

/**
 * Custom Express middleware for Apollo Server v4
 * Works with Express 5 and CommonJS without needing @apollo/server/express4
 * 
 * @param {Object} apolloServer - Started Apollo Server instance
 * @param {Object} pool - PostgreSQL connection pool
 */
const createGraphQLMiddleware = (apolloServer, pool) => {
    const contextFn = createContext(pool);

    return async (req, res) => {
        try {
            // Parse body if needed (Express 5 may not have body-parser by default)
            let body = req.body;
            if (!body && req.readable) {
                const chunks = [];
                for await (const chunk of req) {
                    chunks.push(chunk);
                }
                body = JSON.parse(Buffer.concat(chunks).toString());
            }

            // Create context
            const context = await contextFn(req);

            // Execute GraphQL request
            const response = await apolloServer.executeOperation(
                {
                    query: body.query,
                    variables: body.variables || {},
                    operationName: body.operationName
                },
                { contextValue: context }
            );

            // Handle response
            if (response.body.kind === 'single') {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Cache-Control', 'no-store');
                res.json(response.body.singleResult);
            } else {
                // Incremental delivery (subscriptions) - not supported in simple handler
                res.status(400).json({ error: 'Incremental delivery not supported' });
            }
        } catch (error) {
            console.error('GraphQL Middleware Error:', error);
            res.status(500).json({
                errors: [{ message: error.message || 'Internal server error' }]
            });
        }
    };
};

/**
 * Setup GraphQL endpoint on Express app
 * @param {Object} app - Express app
 * @param {Object} apolloServer - Started Apollo Server instance  
 * @param {Object} pool - PostgreSQL connection pool
 */
const setupGraphQLMiddleware = (app, apolloServer, pool) => {
    const graphqlHandler = createGraphQLMiddleware(apolloServer, pool);

    // Handle both GET (introspection) and POST (queries/mutations)
    app.post('/graphql', graphqlHandler);

    // Simple GraphQL Playground redirect
    app.get('/graphql', (req, res) => {
        res.type('html').send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>GraphQL Playground</title>
                <style>
                    body { font-family: system-ui; padding: 40px; background: #1e1e1e; color: #fff; }
                    h1 { color: #e535ab; }
                    pre { background: #2d2d2d; padding: 20px; border-radius: 8px; overflow-x: auto; }
                    code { color: #9cdcfe; }
                    .tip { color: #6a9955; }
                </style>
            </head>
            <body>
                <h1>🚀 TraceOps GraphQL API</h1>
                <p>This is a GraphQL endpoint. Send POST requests with your queries.</p>
                <h3>Example Query:</h3>
                <pre><code>{
  drivers {
    id
    name
    routes {
      name
      waypoints {
        address
      }
    }
  }
}</code></pre>
                <p class="tip">💡 Tip: Use tools like Postman, Insomnia, or Apollo Studio to explore this API.</p>
                <h3>Quick Test with cURL:</h3>
                <pre><code>curl -X POST http://localhost:3001/graphql \\
  -H "Content-Type: application/json" \\
  -d '{"query": "{ drivers { id name } }"}'</code></pre>
            </body>
            </html>
        `);
    });
};

module.exports = { createApolloServer, createContext, setupGraphQLMiddleware };
