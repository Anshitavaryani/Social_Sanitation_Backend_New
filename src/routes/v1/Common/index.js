/** @format */

const contactUsRoute = require("./contactUs.route");
const faqRoute = require("./faq.route");
const roleRoute = require("./role.route");
const departmentRoute = require("./department.route");
const countryRoute = require("./country.route");
const stateRoute = require("./state.route");
const cityRoute = require("./city.route");
const paymentRoute = require("./payment.route");
const serviceRoute = require("./service.route");
const bookingRoute = require("./booking.route");
const contentRoute = require("./content.route");
const reviewRoute = require("./review.route");
const BDMRoute = require("./BDM.route");
const attendanceRoute = require("./attendance.route");
const firebaseRoute = require("./firebase.route");
const formRoute = require("./form.route");
const serviceChecklistRoute = require("./serviceChecklist.route");
const reportRoute = require("./report.route");
const trendingVideosRoute = require("./trendingVideos.route");
const productRoute = require("./product.route");
const quoteRoute = require("./quote.route");
const invoiceRoute = require("./invoice.route");
const calculatorRoute = require("./calculator.route");
const eqipmentRoute = require("./equipment.route");
const inspectionRoute = require("./inspection.route")

const commonRoutes = [
	{
		path: "/contactUs",
		route: contactUsRoute,
	},
	{
		path: "/faq",
		route: faqRoute,
	},
	{
		path: "/role",
		route: roleRoute,
	},
	{
		path: "/department",
		route: departmentRoute,
	},
	{
		path: "/country",
		route: countryRoute,
	},
	{
		path: "/state",
		route: stateRoute,
	},
	{
		path: "/city",
		route: cityRoute,
	},
	{
		path: "/payment",
		route: paymentRoute,
	},
	{
		path: "/service",
		route: serviceRoute,
	},
	{
		path: "/booking",
		route: bookingRoute,
	},
	{
		path: "/content",
		route: contentRoute,
	},
	{
		path: "/rating",
		route: reviewRoute,
	},
	{
		path: "/bdmuser",
		route: BDMRoute,
	},
	{
		path: "/attendance",
		route: attendanceRoute,
	},
	{
		path: "/firebase",
		route: firebaseRoute,
	},
	{
		path: "/form",
		route: formRoute,
	},
	{
		path: "/checklist",
		route: serviceChecklistRoute,
	},
	{
		path: "/report",
		route: reportRoute,
	},
	{
		path: "/trendingVideos",
		route: trendingVideosRoute,
	},
	{
		path: "/product",
		route: productRoute,
	},
	{
		path: "/quote",
		route: quoteRoute,
	},
	{
		path: "/invoice",
		route: invoiceRoute,
	},
	{
		path: "/calculate",
		route: calculatorRoute,
	},
	{
		path: "/eqipment",
		route: eqipmentRoute,
	},
	{
		path: "/inspection",
		route: inspectionRoute,
	},
];

module.exports = commonRoutes;
