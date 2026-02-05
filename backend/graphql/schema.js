/**
 * GraphQL Schema Definitions for TraceOps Logistics
 * 
 * Current entities: Driver, Route, Waypoint
 * Future entities: Client, Vehicle, Inventory, Invoice
 * 
 * Note: Apollo Server v4 accepts plain strings as typeDefs
 */
const typeDefs = `#graphql
    # === Driver Types ===
    type Driver {
        id: ID!
        name: String!
        email: String
        phone: String
        status: String
        createdAt: String
        # Relationships - resolved with DataLoader to avoid N+1
        routes: [Route!]
    }

    # === Route Types ===
    type Route {
        id: ID!
        name: String!
        status: String
        optimizationMethod: String
        totalDistance: Float
        totalDuration: Float
        createdAt: String
        # Relationships
        driver: Driver
        waypoints: [Waypoint!]
    }

    # === Waypoint Type ===
    type Waypoint {
        id: ID!
        lat: Float!
        lng: Float!
        address: String
        orderIndex: Int
        status: String
        pod: POD
    }

    # === POD (Proof of Delivery) ===
    type POD {
        id: ID!
        waypointId: ID!
        photoUrl: String
        signatureUrl: String
        notes: String
        deliveredAt: String
        location: Location
    }

    type Location {
        lat: Float!
        lng: Float!
    }

    # === Statistics ===
    type DashboardStats {
        totalDrivers: Int!
        totalRoutes: Int!
        activeRoutes: Int!
        completedDeliveries: Int!
    }

    # === Query Root ===
    type Query {
        # Drivers
        drivers: [Driver!]!
        driver(id: ID!): Driver

        # Routes
        routes(driverId: ID, status: String): [Route!]!
        route(id: ID!): Route

        # Dashboard
        dashboardStats: DashboardStats!
    }

    # === Mutation Root (for future use) ===
    type Mutation {
        # Create a new driver
        createDriver(name: String!, email: String, phone: String): Driver

        # Assign route to driver
        assignRoute(routeId: ID!, driverId: ID!): Route

        # Update delivery status
        updateWaypointStatus(waypointId: ID!, status: String!): Waypoint
    }
`;

module.exports = typeDefs;
