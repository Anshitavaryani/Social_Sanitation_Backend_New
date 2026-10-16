const express = require('express');
const router = express.Router();

const {productController} = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');
const { requireAdmin, requireAuth } = require("../../../middlewares/access.middleware");

//admin product apis
router.post('/createProduct', requireAdmin,productController.createProduct);
router.get('/getAllProducts', requireAuth,productController.getAllProducts);
router.get('/getProductById/:id', requireAuth,productController.getProductById);
router.put('/updateProductById/:id', requireAdmin,productController.updateProductById);
router.post('/deleteProduct', requireAdmin,productController.deleteProductById);

// admin request apis
router.post('/updateRequestStatus/:id', requireAdmin,productController.updateRequestStatus);
router.get('/getAllRequestsByAdmin', requireAdmin,productController.getAllRequestsByAdmin);


// user request api
router.post('/requestStock',[userAuthMiddleware.verifyAuthJWTToken],productController.requestStock);
router.get('/getAllRequests',[userAuthMiddleware.verifyAuthJWTToken],productController.getAllRequests);



module.exports = router;