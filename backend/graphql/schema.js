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

    # === SCRC Types ===
    type SCRCOrder {
        id: ID!
        orderNumber: String!
        nic: String
        clientName: String
        technicianName: String
        address: String
        neighborhood: String
        orderType: String
        meterReading: String
        status: String
        auditStatus: String
        executionDate: String
        notes: String
        # Resolved field
        evidence: [SCRCEvidence!]
    }

    type SCRCEvidence {
        id: ID!
        type: String
        url: String
        notes: String
        createdAt: String
        technicianName: String
        location: Location
    }

    type BulkAuditResult {
        success: Boolean!
        count: Int!
        message: String
    }

    # === Statistics ===
    type DashboardStats {
        totalDrivers: Int!
        totalRoutes: Int!
        activeRoutes: Int!
        completedDeliveries: Int!
        pendingAudits: Int
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

        # SCRC
        scrcOrders(status: String, auditStatus: String, technician: String, limit: Int): [SCRCOrder!]!
        scrcOrder(id: ID!): SCRCOrder
    }

    # === Mutation Root (for future use) ===
    type Mutation {
        # Create a new driver
        createDriver(name: String!, email: String, phone: String): Driver

        # Assign route to driver
        assignRoute(routeId: ID!, driverId: ID!): Route

        # Update delivery status
        updateWaypointStatus(waypointId: ID!, status: String!): Waypoint

        # === SCRC Mutations ===
        # Audit an order (approve/reject)
        auditSCRCOrder(id: ID!, status: String!, notes: String): SCRCOrder

        # Bulk audit multiple orders
        bulkAuditSCRCOrders(ids: [ID!]!, status: String!, notes: String): BulkAuditResult

        # Upload evidence (photo or signature)
        uploadSCRCEvidence(
            orderNumber: String!
            type: String
            photo: String
            signature: String
            notes: String
            technicianName: String
            lat: Float
            lng: Float
            capturedAt: String
        ): SCRCEvidence
    }
`;

module.exports = typeDefs;
