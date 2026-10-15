const express = require('express');
const router = express.Router();

const { trendingVideosController } = require('../../../controllers');
const { userAuthMiddleware } = require('../../../middlewares');

router.post('/createTrendingVideo', trendingVideosController.createTrendingVideo);
router.get('/getAllTrendingVideos' , trendingVideosController.getAllTrendingVideos);
router.get('/findTrendingVideoById/:id' , trendingVideosController.findTrendingVideoById);
router.put('/updateTrendingVideo/:id' , trendingVideosController.updateTrendingVideo);
router.post('/deleteTrendingVideo' , trendingVideosController.deleteTrendingVideo);


module.exports = router;