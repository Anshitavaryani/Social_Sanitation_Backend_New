const express = require('express');
const router = express.Router();

const { trendingVideosController } = require('../../../controllers');
const { publicRoute, requireAdmin } = require("../../../middlewares/access.middleware");

router.post('/createTrendingVideo', requireAdmin, trendingVideosController.createTrendingVideo);
router.get('/getAllTrendingVideos', publicRoute , trendingVideosController.getAllTrendingVideos);
router.get('/findTrendingVideoById/:id', publicRoute , trendingVideosController.findTrendingVideoById);
router.put('/updateTrendingVideo/:id', requireAdmin , trendingVideosController.updateTrendingVideo);
router.post('/deleteTrendingVideo', requireAdmin , trendingVideosController.deleteTrendingVideo);


module.exports = router;