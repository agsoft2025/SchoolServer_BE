const axios = require('axios')

exports.fetchLocationStatus = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];

        const locationData = await axios.get(`${process.env.GLOBAL_URL}/api/subscribers/locations/stats`,{
            params:req.query,
            headers:{
                Authorization:`Bear ${token}`
            }
        })
        return res.status(200).send(locationData.data)

    } catch (error) {
        console.log("<><>error",error)
        return res.status(500).send({ status: false, message: "internal server down" })
    }
}

exports.fetchLocationWiseData = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        const locationData = await axios.get(`${process.env.GLOBAL_URL}/api/subscribers/location/${req.params.locationId}`,{
            params:req.query,
            headers:{
                Authorization:`Bear ${token}`
            }
        })

        return res.status(200).send(locationData.data)

    } catch (error) {

        return res.status(500).send({ status: false, message: "internal server down" })
    }
}

exports.subscriptionwiseHistory = async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        const token = authHeader && authHeader.split(' ')[1];
        if(!token){
            return res.status(403).send({status:false})
        }
        const url = `${process.env.GLOBAL_URL}/api/subscribers/${req.params.studentId}/history`
        
        const locationData = await axios.get(url,{
            params:req.query,
            headers:{
                Authorization:`Bear ${token}`
            }
        })
        // const urlData = `${locationData.data.data[0].location.baseUrl}/student-pro/info/${req.params.studentId}`
        
        //   const userData = await axios.get(urlData)
        // locationData.data.studentData = userData.data.data
        
        return res.status(200).send(locationData.data)

    } catch (error) {
        console.log("<>>",error);
        
        return res.status(500).send({ status: false, message: "internal server down" })
    }
}