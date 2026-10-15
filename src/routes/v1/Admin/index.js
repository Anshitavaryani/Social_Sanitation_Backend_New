const adminAuthRoute = require('./adminAuth.route');
const userRoute = require("./user.route");
const adminBookingRoute = require("./booking.route")


const adminRoutes = [
    {
        path: '/admin/auth/',
        route: adminAuthRoute,
    },
    {
        path: '/admin/user/',
        route: userRoute,
    },
    {
        path: '/admin/booking/',
        route: adminBookingRoute
    },
];

module.exports = adminRoutes;