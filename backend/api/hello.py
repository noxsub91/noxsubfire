from http.server import BaseHTTPRequestHandler

def handler(request):
    return {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": "https://noxsub-45150.web.app",  # Domínio do seu Firebase
            "Content-Type": "application/json"
        },
        "body": '{"message": "Hello from Vercel Python Serverless!"}'
    }
