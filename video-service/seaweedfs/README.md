aws s3 mb s3://hr-app-data --endpoint-url http://localhost:8333
aws s3 rb s3://hr-app-data --endpoint-url http://localhost:8333
aws s3api put-bucket-cors --bucket hr-app-data --cors-configuration file://video-service/seaweedfs/config/cors.json  --endpoint-url http://localhost:8333
aws s3api get-bucket-cors --bucket hr-app-data
