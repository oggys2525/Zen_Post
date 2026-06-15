from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

router = APIRouter()

@router.post("/login")
def login():
    return {"token": "placeholder-token"}

@router.get("/verify")
def verify_token(token: str = Depends(OAuth2PasswordBearer(tokenUrl="token"))):
    return {"valid": True}