aws s3 mb s3://hr-app-data --endpoint-url http://localhost:8333
aws s3 rb s3://hr-app-data --endpoint-url http://localhost:8333
aws s3api put-bucket-cors --bucket hr-app-data --cors-configuration file://config/cors.json  --endpoint-url http://localhost:8333
aws s3api get-bucket-cors --bucket hr-app-data
aws s3 cp s3://hr-app-data/videos/processed/019d16c0-746f-753a-b557-bcdc0f287c4f/manifest.mpd . --endpoint-url http://localhost:8333
