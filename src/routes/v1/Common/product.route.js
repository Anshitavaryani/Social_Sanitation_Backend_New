const express = require('express');
const router = express.Router();

const {productController} = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');

//admin product apis
router.post('/createProduct',productController.createProduct);
router.get('/getAllProducts',productController.getAllProducts);
router.get('/getProductById/:id',productController.getProductById);
router.put('/updateProductById/:id',productController.updateProductById);
router.post('/deleteProduct',productController.deleteProductById);

// admin request apis
router.post('/updateRequestStatus/:id',productController.updateRequestStatus);
router.get('/getAllRequestsByAdmin',productController.getAllRequestsByAdmin);


// user request api
router.post('/requestStock',[userAuthMiddleware.verifyAuthJWTToken],productController.requestStock);
router.get('/getAllRequests',[userAuthMiddleware.verifyAuthJWTToken],productController.getAllRequests);



module.exports = router;