const express = require('express');
const router = express.Router();


const { userAuthMiddleware } = require('../../../middlewares');
const { reviewController } = require('../../../controllers');
const { publicRoute } = require("../../../middlewares/access.middleware");
const ownership = require("../../../middlewares/ownership.middleware");

router.post('/postReviewAndRating',[userAuthMiddleware.verifyAuthJWTToken],reviewController.postReviewAndRating);
router.put('/updateReviewAndRating',[userAuthMiddleware.verifyAuthJWTToken],reviewController.updateReviewAndRating);
router.delete('/deleteReviewAndRating/:id',[userAuthMiddleware.verifyAuthJWTToken], ownership.ownReview(ownership.param("id")), reviewController.deleteReviewAndRating);
router.post('/getReviewsAndRatings',[userAuthMiddleware.verifyAuthJWTToken],reviewController.getReviewsAndRatings);
router.post('/getAllReviewsAndRatings', publicRoute,reviewController.getAllReviewsAndRatings);


module.exports = router;