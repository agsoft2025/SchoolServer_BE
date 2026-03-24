const { sendWhatsAppOTP } = require("../service/sms.service");

exports.verifyWebhook = async (req, res) => {
    try {
        const VERIFY_TOKEN = "my_verify_token";

        const mode = req.query["hub.mode"];
        const token = req.query["hub.verify_token"];
        const challenge = req.query["hub.challenge"];
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
            console.log("Webhook verified");
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }

    } catch (error) {
        res.sendStatus(403);
        // return res.status(500).send({ status: false, message: "internal server down", error: error.message });
    }
}

exports.addWebhook = async (req, res) => {
    try {
        console.log("Webhook event received:");
        console.log(JSON.stringify(req.body, null, 2));
        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(403);
        // return res.status(500).send({ status: false, message: "internal server down", error: error.message });
    }
}

exports.sendwhatsappsms = async (req, res) => {
    try {
        sendWhatsAppOTP("918714149097","813988")
        // sendWhatsAppOTP("918940891631","813988")
        res.sendStatus(200);
    } catch (error) {
        res.sendStatus(403);
        // return res.status(500).send({ status: false, message: "internal server down", error: error.message });
    }
}