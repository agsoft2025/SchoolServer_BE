const express = require('express');
const router = express.Router();
const globalController = require("../controllers/globalServerController")


router.get("/locations/stats",globalController.fetchLocationStatus)
router.get("/locations/:locationId",globalController.fetchLocationWiseData)
router.get("/:studentId/history",globalController.subscriptionwiseHistory)

module.exports = router;