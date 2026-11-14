"""ROTA SEGURA - API (FastAPI + MongoDB).

Modelo de dados espelha tabelas relacionais (ids UUID string, sem ObjectId exposto)
para facilitar a migração futura para Supabase/Postgres (ver /app/docs/ARQUITETURA.md).
"""
import asyncio
import hashlib
import logging
import os
import re
import secrets
import time
import uuid
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from html import escape
from pathlib import Path
from typing import List, Literal, Optional

import bcrypt
import jwt
import stripe
import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from starlette.middleware.cors import CORSMiddleware

from email_service import send_email

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
TOKEN_DAYS = 7
logger = logging.getLogger("rotasegura")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")

INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("email", ASCENDING)], name="email", unique=True), IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "contacts": [IndexModel([("user_id", ASCENDING)], name="user_id")],
    "alerts": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created")],
    "incidents": [IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created")],
    "shares": [IndexModel([("token", ASCENDING)], name="token", unique=True)],
    "notifications": [IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created")],
    "community_messages": [IndexModel([("created_at", DESCENDING)], name="created_at"), IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created")],
    "push_tokens": [IndexModel([("token", ASCENDING)], name="token", unique=True), IndexModel([("user_id", ASCENDING)], name="user_id")],
    "plans": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
    "payment_transactions": [IndexModel([("session_id", ASCENDING)], name="session_id", unique=True)],
    "login_attempts": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "feedback": [IndexModel([("user_id", ASCENDING), ("created_at", DESCENDING)], name="user_created_feedback")],
    "authorities": [IndexModel([("id", ASCENDING)], name="id", unique=True)],
}


async def ensure_indexes() -> None:
    for coll, models in INDEXES.items():
        for m in models:
            try:
                await db[coll].create_indexes([m])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", coll, m.document["name"], exc)


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(d: datetime) -> str:
    return d.isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


app = FastAPI(title="ROTA SEGURA API")


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------- Auth
DriverType = Literal["aplicativo", "taxi", "profissional"]


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str = Field(default="", max_length=20)
    driver_type: DriverType = "aplicativo"
    lgpd_consent: bool


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(default="", max_length=20)
    driver_type: DriverType
    vehicle: str = Field(default="", max_length=60)
    city: str = Field(default="", max_length=60)


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def hash_authority_keyword(value: str) -> str:
    digest = hashlib.sha256(value.casefold().encode("utf-8")).digest()
    return bcrypt.hashpw(digest, bcrypt.gensalt()).decode()


def verify_pw(p: str, h: str) -> bool:
    return bcrypt.checkpw(p.encode(), h.encode())


def make_token(uid: str) -> str:
    return jwt.encode({"sub": uid, "exp": now() + timedelta(days=TOKEN_DAYS), "iat": now()}, JWT_SECRET, algorithm=JWT_ALG)


def is_premium(u: dict) -> bool:
    exp = u.get("plan_expires_at")
    return u.get("plan", "gratuito") != "gratuito" and bool(exp) and datetime.fromisoformat(exp) > now()


def public_user(u: dict) -> dict:
    return {
        "id": u["id"], "name": u["name"], "email": u["email"], "phone": u.get("phone", ""),
        "driver_type": u.get("driver_type", "aplicativo"), "vehicle": u.get("vehicle", ""),
        "city": u.get("city", ""), "role": u.get("role", "user"),
        "plan": u.get("plan", "gratuito") if is_premium(u) else "gratuito",
        "plan_expires_at": u.get("plan_expires_at") if is_premium(u) else None,
        "is_premium": is_premium(u), "created_at": u.get("created_at"),
        "location_consent": u.get("location_consent", False),
    }


async def current_user(cred: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> dict:
    if not cred:
        raise HTTPException(401, "Não autenticado")
    try:
        uid = jwt.decode(cred.credentials, JWT_SECRET, algorithms=[JWT_ALG])["sub"]
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Sessão expirada. Entre novamente.")
    u = await db.users.find_one({"id": uid}, {"_id": 0})
    if not u:
        raise HTTPException(401, "Usuário não encontrado")
    if u.get("blocked"):
        raise HTTPException(403, "Conta suspensa. Fale com o suporte.")
    return u


async def admin_user(u: dict = Depends(current_user)) -> dict:
    if u.get("role") != "admin":
        raise HTTPException(403, "Acesso restrito a administradores")
    return u


async def deliver_push(user_id: str, title: str, body: str, kind: str) -> None:
    tokens = await db.push_tokens.find({"user_id": user_id}, {"_id": 0, "token": 1}).to_list(100)
    if not tokens:
        return
    messages = [{"to": item["token"], "title": title, "body": body[:240], "sound": "default", "priority": "high",
                 "data": {"kind": kind}} for item in tokens]
    try:
        async with httpx.AsyncClient(timeout=8) as session:
            for start in range(0, len(messages), 100):
                response = await session.post("https://exp.host/--/api/v2/push/send", json=messages[start:start + 100],
                                              headers={"Accept": "application/json", "Content-Type": "application/json"})
                response.raise_for_status()
    except Exception as exc:
        logger.warning("Expo push delivery failed for user %s: %s", user_id, exc)


async def notify(user_id: str, title: str, body: str, kind: str = "info"):
    await db.notifications.insert_one({"id": new_id(), "user_id": user_id, "title": title, "body": body,
                                       "kind": kind, "read": False, "created_at": iso(now())})
    asyncio.create_task(deliver_push(user_id, title, body, kind))


@api.post("/auth/register")
async def register(body: RegisterIn):
    if not body.lgpd_consent:
        raise HTTPException(400, "É necessário aceitar a Política de Privacidade (LGPD)")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Este e-mail já está cadastrado")
    u = {"id": new_id(), "name": body.name.strip(), "email": email, "password_hash": hash_pw(body.password),
         "phone": body.phone, "driver_type": body.driver_type, "vehicle": "", "city": "", "role": "user",
         "plan": "gratuito", "plan_expires_at": None, "blocked": False, "lgpd_consent_at": iso(now()),
         "location_consent": False, "created_at": iso(now())}
    await db.users.insert_one(u)
    await notify(u["id"], "Bem-vindo ao ROTA SEGURA", "Cadastre seus contatos de confiança para usar o SOS.")
    return {"token": make_token(u["id"]), "user": public_user(u)}


@api.post("/auth/login")
async def login(body: LoginIn):
    email = body.email.lower().strip()
    att = await db.login_attempts.find_one({"key": email}, {"_id": 0})
    if att and att.get("locked_until") and datetime.fromisoformat(att["locked_until"]) > now():
        raise HTTPException(429, "Muitas tentativas. Tente novamente em 15 minutos.")
    u = await db.users.find_one({"email": email}, {"_id": 0})
    if not u or not verify_pw(body.password, u["password_hash"]):
        count = (att or {}).get("count", 0) + 1
        upd = {"count": count}
        if count >= 5:
            upd = {"count": 0, "locked_until": iso(now() + timedelta(minutes=15))}
        await db.login_attempts.update_one({"key": email}, {"$set": upd}, upsert=True)
        raise HTTPException(401, "E-mail ou senha incorretos")
    await db.login_attempts.delete_one({"key": email})
    if u.get("blocked"):
        raise HTTPException(403, "Conta suspensa. Fale com o suporte.")
    return {"token": make_token(u["id"]), "user": public_user(u)}


@api.get("/auth/me")
async def me(u: dict = Depends(current_user)):
    return public_user(u)


@api.put("/profile")
async def update_profile(body: ProfileIn, u: dict = Depends(current_user)):
    await db.users.update_one({"id": u["id"]}, {"$set": body.model_dump()})
    return public_user({**u, **body.model_dump()})


class ConsentIn(BaseModel):
    location_consent: bool


@api.put("/privacy/consent")
async def set_consent(body: ConsentIn, u: dict = Depends(current_user)):
    await db.users.update_one({"id": u["id"]}, {"$set": {"location_consent": body.location_consent}})
    return {"ok": True}


class GeocodeIn(BaseModel):
    query: str = Field(min_length=2, max_length=120)


_geocode_lock = asyncio.Lock()
_geocode_last_request = 0.0


@api.post("/location/geocode")
async def geocode_city(body: GeocodeIn, _: dict = Depends(current_user)):
    """Busca a cidade indicada pelo usuário; sem coordenada fixa no cliente."""
    global _geocode_last_request
    try:
        async with _geocode_lock:
            delay = 1.05 - (time.monotonic() - _geocode_last_request)
            if delay > 0:
                await asyncio.sleep(delay)
            async with httpx.AsyncClient(timeout=8, headers={"User-Agent": "RotaSegura/1.0 (city selection)"}) as client:
                response = await client.get("https://nominatim.openstreetmap.org/search", params={
                    "q": body.query, "format": "jsonv2", "limit": 1, "addressdetails": 1, "countrycodes": "br",
                })
                _geocode_last_request = time.monotonic()
                response.raise_for_status()
                matches = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Não foi possível buscar a cidade agora. Tente novamente.")
    if not matches:
        raise HTTPException(404, "Cidade não encontrada. Informe cidade e estado.")
    item = matches[0]
    address = item.get("address", {})
    city = address.get("city") or address.get("town") or address.get("municipality") or address.get("village") or address.get("county")
    state = address.get("state") or "Brasil"
    try:
        lat, lng = float(item["lat"]), float(item["lon"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(502, "O serviço de mapas retornou coordenadas inválidas.")
    if not (-34 <= lat <= 6 and -74 <= lng <= -34):
        raise HTTPException(422, "Selecione uma cidade no Brasil.")
    return {"lat": lat, "lng": lng, "city": city or body.query.strip(), "state": state}


class FeedbackIn(BaseModel):
    category: Literal["sugestao", "problema", "funcionalidade"]
    message: str = Field(min_length=5, max_length=2000)


@api.post("/feedback", status_code=201)
async def create_feedback(body: FeedbackIn, u: dict = Depends(current_user)):
    message = body.message.strip()
    if len(message) < 5:
        raise HTTPException(422, "Escreva pelo menos 5 caracteres")
    since = iso(now() - timedelta(days=1))
    if await db.feedback.count_documents({"user_id": u["id"], "created_at": {"$gte": since}}) >= 10:
        raise HTTPException(429, "Limite diário de contribuições atingido. Tente amanhã.")
    item = {"id": new_id(), "user_id": u["id"], "category": body.category,
            "message": message, "status": "novo", "created_at": iso(now())}
    await db.feedback.insert_one(item)
    return {"ok": True, "id": item["id"]}


@api.get("/privacy/export")
async def export_data(u: dict = Depends(current_user)):
    """LGPD art. 18 - portabilidade/acesso aos dados."""
    q = {"user_id": u["id"]}
    return {
        "usuario": public_user(u),
        "contatos": await db.contacts.find(q, {"_id": 0}).to_list(100),
        "incidentes": await db.incidents.find(q, {"_id": 0}).to_list(1000),
        "alertas_enviados": await db.alerts.find({"reporter_id": u["id"]}, {"_id": 0, "reporter_id": 0, "flagged_by": 0, "confirmed_by": 0}).to_list(1000),
        "compartilhamentos": await db.shares.find(q, {"_id": 0}).to_list(1000),
        "contribuicoes": await db.feedback.find(q, {"_id": 0}).to_list(1000),
        "exportado_em": iso(now()),
    }


@api.delete("/privacy/account")
async def delete_account(u: dict = Depends(current_user)):
    """LGPD - eliminação dos dados pessoais. Alertas aprovados ficam anônimos."""
    q = {"user_id": u["id"]}
    for c in ("contacts", "incidents", "shares", "notifications", "payment_transactions", "feedback"):
        await db[c].delete_many(q)
    await db.alerts.update_many({"reporter_id": u["id"]}, {"$set": {"reporter_id": None}})
    await db.alerts.update_many({"$or": [{"confirmed_by": u["id"]}, {"flagged_by": u["id"]}]}, {"$pull": {"confirmed_by": u["id"], "flagged_by": u["id"]}})
    await db.users.delete_one({"id": u["id"]})
    return {"ok": True}


# ---------------------------------------------------------------- Contacts
class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    phone: str = Field(min_length=8, max_length=20)
    email: Optional[EmailStr] = None
    relation: str = Field(default="", max_length=30)


def contact_limit(u: dict) -> int:
    return 10 if is_premium(u) else 3


@api.get("/contacts")
async def list_contacts(u: dict = Depends(current_user)):
    items = await db.contacts.find({"user_id": u["id"]}, {"_id": 0}).sort("created_at", 1).to_list(50)
    return {"items": items, "limit": contact_limit(u)}


@api.post("/contacts")
async def add_contact(body: ContactIn, u: dict = Depends(current_user)):
    if await db.contacts.count_documents({"user_id": u["id"]}) >= contact_limit(u):
        raise HTTPException(403, f"Limite de {contact_limit(u)} contatos no seu plano. Assine o Premium para até 10.")
    c = {"id": new_id(), "user_id": u["id"], **body.model_dump(), "created_at": iso(now())}
    await db.contacts.insert_one(c)
    c.pop("_id", None)
    return c


@api.put("/contacts/{cid}")
async def edit_contact(cid: str, body: ContactIn, u: dict = Depends(current_user)):
    r = await db.contacts.update_one({"id": cid, "user_id": u["id"]}, {"$set": body.model_dump()})
    if not r.matched_count:
        raise HTTPException(404, "Contato não encontrado")
    return {"ok": True}


@api.delete("/contacts/{cid}")
async def del_contact(cid: str, u: dict = Depends(current_user)):
    await db.contacts.delete_one({"id": cid, "user_id": u["id"]})
    return {"ok": True}


# ---------------------------------------------------------------- SOS / Incidents
class SosIn(BaseModel):
    lat: Optional[float] = None
    lng: Optional[float] = None
    accuracy: Optional[float] = None
    note: str = Field(default="", max_length=200)


class SosActionIn(BaseModel):
    action: Literal["whatsapp", "sms", "ligacao_190", "ligacao_192", "ligacao_193", "email", "cancelado", "resolvido"]


def maps_link(lat, lng) -> str:
    return f"https://maps.google.com/?q={lat},{lng}" if lat is not None and lng is not None else ""


@api.post("/sos")
async def create_sos(body: SosIn, u: dict = Depends(current_user)):
    inc = {"id": new_id(), "user_id": u["id"], "type": "sos", "lat": body.lat, "lng": body.lng,
           "accuracy": body.accuracy, "note": body.note, "actions": [], "status": "aberto", "created_at": iso(now())}
    await db.incidents.insert_one(inc)
    inc.pop("_id", None)
    return inc


@api.post("/sos/{iid}/action")
async def sos_action(iid: str, body: SosActionIn, u: dict = Depends(current_user)):
    upd: dict = {"$push": {"actions": {"action": body.action, "at": iso(now())}}}
    if body.action in ("cancelado", "resolvido"):
        upd["$set"] = {"status": body.action}
    r = await db.incidents.update_one({"id": iid, "user_id": u["id"]}, upd)
    if not r.matched_count:
        raise HTTPException(404, "Ocorrência não encontrada")
    return {"ok": True}


@api.post("/sos/{iid}/email")
async def sos_email(iid: str, u: dict = Depends(current_user)):
    """Envia e-mail REAL aos contatos cadastrados (destinatários vêm do servidor)."""
    inc = await db.incidents.find_one({"id": iid, "user_id": u["id"]}, {"_id": 0})
    if not inc:
        raise HTTPException(404, "Ocorrência não encontrada")
    if any(a["action"] == "email" for a in inc.get("actions", [])):
        raise HTTPException(409, "E-mails já enviados para esta ocorrência")
    since = iso(now() - timedelta(hours=1))
    recent = await db.incidents.count_documents({"user_id": u["id"], "actions": {"$elemMatch": {"action": "email", "at": {"$gte": since}}}})
    if recent >= 3:
        raise HTTPException(429, "Limite de envios por hora atingido. Use WhatsApp/SMS ou ligue 190.")
    contacts = await db.contacts.find({"user_id": u["id"], "email": {"$nin": [None, ""]}}, {"_id": 0}).to_list(10)
    if not contacts:
        raise HTTPException(400, "Nenhum contato com e-mail cadastrado")
    link = maps_link(inc.get("lat"), inc.get("lng"))
    loc_html = (f'<p><a href="{escape(link)}" style="color:#FF6B35;font-weight:bold">Abrir localização no mapa</a></p>'
                if link else "<p>A localização não estava disponível no momento do pedido.</p>")
    when = datetime.fromisoformat(inc["created_at"]).astimezone(timezone(timedelta(hours=-3))).strftime("%d/%m/%Y %H:%M")
    sent = 0
    for c in contacts:
        html = (f'<table role="presentation" width="100%"><tr><td style="padding:24px;font-family:Arial,sans-serif;color:#111827">'
                f'<h2 style="color:#0B2545">Pedido de ajuda de {escape(u["name"])}</h2>'
                f'<p>Olá {escape(c["name"])}, {escape(u["name"])} acionou o botão SOS no aplicativo ROTA SEGURA em {when} (horário de Brasília).</p>'
                f'{loc_html}<p>Tente contato imediatamente pelo telefone {escape(u.get("phone") or "cadastrado")}. '
                f'Se não conseguir falar com a pessoa e houver risco, ligue 190 (Polícia Militar).</p>'
                f'<p style="font-size:12px;color:#6B7280">Enviado por ROTA SEGURA porque você foi cadastrado(a) como contato de confiança. '
                f'Nunca pedimos senhas ou dados de cartão por e-mail.</p></td></tr></table>')
        try:
            await send_email(to=c["email"], subject=f"SOS: {u['name']} pediu ajuda", html=html)
            sent += 1
        except HTTPException as e:
            logger.warning("SOS email to contact failed: %s", e.detail)
    if not sent:
        raise HTTPException(502, "Não foi possível enviar os e-mails agora. Use WhatsApp/SMS ou ligue 190.")
    await db.incidents.update_one({"id": iid}, {"$push": {"actions": {"action": "email", "at": iso(now()), "sent": sent}}})
    return {"sent": sent, "total": len(contacts)}


@api.get("/incidents")
async def incidents(u: dict = Depends(current_user)):
    sos = await db.incidents.find({"user_id": u["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    reports = await db.alerts.find({"reporter_id": u["id"]}, {"_id": 0, "reporter_id": 0, "flagged_by": 0, "confirmed_by": 0}).sort("created_at", -1).to_list(200)
    return {"sos": sos, "reports": reports}


# ---------------------------------------------------------------- Location sharing
class ShareIn(BaseModel):
    lat: float
    lng: float
    hours: float = Field(default=1, gt=0, le=8)


class LocIn(BaseModel):
    lat: float
    lng: float


class GPSPoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    timestamp: int = Field(ge=0)
    accuracy: float = Field(default=25, ge=1, le=1000)


class NavigationIn(BaseModel):
    origin: GPSPoint
    destination_lat: float = Field(ge=-90, le=90)
    destination_lng: float = Field(ge=-180, le=180)
    mode: Literal["driving", "walking"] = "driving"


class MatchIn(BaseModel):
    points: List[GPSPoint] = Field(min_length=2, max_length=50)
    mode: Literal["driving", "walking"] = "driving"


OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org").rstrip("/")
OSRM_FOOT_BASE_URL = os.environ.get("OSRM_FOOT_BASE_URL", "").rstrip("/")


@api.post("/navigation/route")
async def navigation_route(body: NavigationIn, _: dict = Depends(current_user)):
    routing_url = OSRM_BASE_URL if body.mode == "driving" else OSRM_FOOT_BASE_URL
    if not routing_url:
        raise HTTPException(503, "Rotas a pé ainda não estão configuradas neste servidor.")
    coordinates = f"{body.origin.lng},{body.origin.lat};{body.destination_lng},{body.destination_lat}"
    try:
        async with httpx.AsyncClient(timeout=12) as session:
            response = await session.get(f"{routing_url}/route/v1/{body.mode}/{coordinates}", params={
                "overview": "full", "geometries": "geojson", "steps": "true", "alternatives": "false",
            })
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("OSRM route request failed: %s", exc)
        raise HTTPException(502, "O serviço de rotas está indisponível. Tente novamente.")
    if payload.get("code") != "Ok" or not payload.get("routes"):
        raise HTTPException(422, "Não foi possível encontrar uma rota para esse destino.")
    route = payload["routes"][0]
    steps = [{"name": step.get("name", ""), "distance": step.get("distance", 0), "duration": step.get("duration", 0),
              "type": step.get("maneuver", {}).get("type", "continue"), "modifier": step.get("maneuver", {}).get("modifier", "")}
             for leg in route.get("legs", []) for step in leg.get("steps", [])]
    return {"geometry": route.get("geometry", {}).get("coordinates", []), "distance": route.get("distance", 0),
            "duration": route.get("duration", 0), "steps": steps}


@api.post("/navigation/match")
async def navigation_match(body: MatchIn, _: dict = Depends(current_user)):
    routing_url = OSRM_BASE_URL if body.mode == "driving" else OSRM_FOOT_BASE_URL
    if not routing_url:
        raise HTTPException(503, "Ajuste de trajeto a pé ainda não está configurado neste servidor.")
    points = body.points
    if any(points[i].timestamp >= points[i + 1].timestamp for i in range(len(points) - 1)):
        raise HTTPException(422, "Os horários dos pontos do GPS precisam estar em ordem crescente.")
    coordinates = ";".join(f"{point.lng},{point.lat}" for point in points)
    params = {
        "overview": "full", "geometries": "geojson", "steps": "false", "tidy": "true", "gaps": "split",
        "timestamps": ";".join(str(point.timestamp) for point in points),
        "radiuses": ";".join(str(min(max(point.accuracy, 5), 100)) for point in points),
    }
    try:
        async with httpx.AsyncClient(timeout=12) as session:
            response = await session.get(f"{routing_url}/match/v1/{body.mode}/{coordinates}", params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("OSRM map matching request failed: %s", exc)
        raise HTTPException(502, "O ajuste GPS à via está indisponível no momento.")
    if payload.get("code") != "Ok" or not payload.get("matchings"):
        return {"geometry": [], "confidence": 0, "matched": False}
    best = max(payload["matchings"], key=lambda item: item.get("confidence", 0))
    return {"geometry": best.get("geometry", {}).get("coordinates", []), "confidence": best.get("confidence", 0),
            "matched": True, "tracepoints": payload.get("tracepoints", [])}


@api.post("/share")
async def start_share(body: ShareIn, u: dict = Depends(current_user)):
    hours = body.hours if is_premium(u) else min(body.hours, 1)
    await db.shares.update_many({"user_id": u["id"], "active": True}, {"$set": {"active": False}})
    s = {"id": new_id(), "token": secrets.token_urlsafe(16), "user_id": u["id"], "name": u["name"].split(" ")[0],
         "lat": body.lat, "lng": body.lng, "updated_at": iso(now()), "expires_at": iso(now() + timedelta(hours=hours)),
         "active": True, "created_at": iso(now())}
    await db.shares.insert_one(s)
    s.pop("_id", None)
    return s


@api.get("/share/active")
async def active_share(u: dict = Depends(current_user)):
    s = await db.shares.find_one({"user_id": u["id"], "active": True, "expires_at": {"$gt": iso(now())}}, {"_id": 0})
    return s or {}


@api.put("/share/{sid}/location")
async def update_share(sid: str, body: LocIn, u: dict = Depends(current_user)):
    r = await db.shares.update_one({"id": sid, "user_id": u["id"], "active": True, "expires_at": {"$gt": iso(now())}},
                                   {"$set": {"lat": body.lat, "lng": body.lng, "updated_at": iso(now())}})
    if not r.matched_count:
        raise HTTPException(410, "Compartilhamento encerrado ou expirado")
    return {"ok": True}


@api.delete("/share/{sid}")
async def stop_share(sid: str, u: dict = Depends(current_user)):
    await db.shares.update_one({"id": sid, "user_id": u["id"]}, {"$set": {"active": False}})
    return {"ok": True}


@api.get("/public/share/{token}", response_class=HTMLResponse)
async def public_share(token: str):
    s = await db.shares.find_one({"token": token}, {"_id": 0})
    style = "font-family:Arial,sans-serif;margin:0;padding:24px;background:#F4F5F7;color:#111827"
    if not s or not s["active"] or datetime.fromisoformat(s["expires_at"]) < now():
        return HTMLResponse(f'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="{style}">'
                            '<h2 style="color:#0B2545">ROTA SEGURA</h2><p>Este compartilhamento de localização foi encerrado ou expirou.</p></body></html>')
    lat, lng = s["lat"], s["lng"]
    upd = datetime.fromisoformat(s["updated_at"]).astimezone(timezone(timedelta(hours=-3))).strftime("%d/%m %H:%M:%S")
    bbox = f"{lng-0.01},{lat-0.006},{lng+0.01},{lat+0.006}"
    return HTMLResponse(
        f'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="20">'
        f'<title>ROTA SEGURA - Localização</title></head><body style="{style}">'
        f'<h2 style="color:#0B2545;margin:0">ROTA SEGURA</h2><p>Localização em tempo real de <b>{escape(s["name"])}</b></p>'
        f'<iframe width="100%" height="380" style="border:0;border-radius:16px" src="https://www.openstreetmap.org/export/embed.html?bbox={bbox}&layer=mapnik&marker={lat},{lng}"></iframe>'
        f'<p>Última atualização: {upd} (Brasília). A página atualiza sozinha.</p>'
        f'<p><a style="display:inline-block;background:#FF6B35;color:#fff;padding:14px 20px;border-radius:12px;text-decoration:none;font-weight:bold" href="{maps_link(lat, lng)}">Abrir no Google Maps</a></p>'
        f'<p style="font-size:12px;color:#6B7280">Em caso de emergência, ligue 190.</p></body></html>')


# ---------------------------------------------------------------- Alerts (moderated)
Category = Literal["assalto", "roubo_veiculo", "via_perigosa", "acidente", "alagamento", "sem_iluminacao", "outro"]
PLATE_RE = re.compile(r"\b[A-Za-z]{3}[- ]?\d[A-Za-z0-9]\d{2}\b")
CPF_RE = re.compile(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b")
PHONE_RE = re.compile(r"\(?\d{2}\)?\s?9?\d{4}-?\d{4}")
BAD_WORDS = ("ladrão", "ladrao", "bandido", "vagabundo", "safado", "criminoso")


class AlertIn(BaseModel):
    category: Category
    description: str = Field(min_length=10, max_length=280)
    lat: float
    lng: float
    neighborhood: Optional[str] = Field(default=None, max_length=80)


def validate_text(t: str):
    if PLATE_RE.search(t):
        raise HTTPException(400, "Não informe placas de veículos. Descreva apenas a situação de risco no local.")
    if CPF_RE.search(t) or PHONE_RE.search(t):
        raise HTTPException(400, "Não inclua documentos ou telefones de terceiros.")
    if any(w in t.lower() for w in BAD_WORDS):
        raise HTTPException(400, "Evite acusar pessoas. Descreva o fato e o local, sem julgamentos.")


def public_alert(a: dict, uid: str) -> dict:
    return {k: a.get(k) for k in ("id", "category", "description", "lat", "lng", "status", "created_at", "confirmations", "neighborhood")} | {
        "confirmed_by_me": uid in a.get("confirmed_by", []), "flagged_by_me": uid in a.get("flagged_by", []),
        "is_mine": a.get("reporter_id") == uid}


@api.post("/alerts")
async def create_alert(body: AlertIn, u: dict = Depends(current_user)):
    validate_text(body.description)
    since = iso(now() - timedelta(days=1))
    if await db.alerts.count_documents({"reporter_id": u["id"], "created_at": {"$gte": since}}) >= 5:
        raise HTTPException(429, "Limite de 5 relatos por dia atingido.")
    a = {"id": new_id(), "reporter_id": u["id"], "category": body.category, "description": body.description.strip(),
         "neighborhood": re.sub(r"\s+", " ", body.neighborhood or "").strip()[:80] or None,
         # Privacidade: coordenadas arredondadas (~100 m)
         "lat": round(body.lat, 3), "lng": round(body.lng, 3), "status": "pendente", "confirmations": 0,
         "confirmed_by": [], "flagged_by": [], "flags": 0, "created_at": iso(now())}
    await db.alerts.insert_one(a)
    return {"id": a["id"], "status": "pendente"}


@api.get("/alerts")
async def list_alerts(category: Optional[str] = None, hours: int = 72, u: dict = Depends(current_user)):
    q: dict = {"status": "aprovado", "created_at": {"$gte": iso(now() - timedelta(hours=min(hours, 720)))}}
    if category:
        q["category"] = category
    items = await db.alerts.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    return [public_alert(a, u["id"]) for a in items]


@api.get("/alerts/stats/neighborhoods")
async def neighborhood_alert_stats(hours: int = 720, _: dict = Depends(current_user)):
    """Aggregate approved community reports; no official crime statistics are implied."""
    window = min(max(hours, 1), 720)
    since = iso(now() - timedelta(hours=window))
    rows = await db.alerts.find({"status": "aprovado", "created_at": {"$gte": since},
                                "neighborhood": {"$type": "string", "$ne": ""}},
                                {"_id": 0, "category": 1, "neighborhood": 1}).to_list(5000)
    grouped: dict[str, dict] = {}
    for row in rows:
        name = row["neighborhood"].strip()
        key = name.casefold()
        item = grouped.setdefault(key, {"neighborhood": name, "total": 0, "categories": {}})
        item["total"] += 1
        category = row.get("category", "outro")
        item["categories"][category] = item["categories"].get(category, 0) + 1
    return {"source": "relatos aprovados da comunidade", "hours": window,
            "neighborhoods": sorted(grouped.values(), key=lambda item: (-item["total"], item["neighborhood"].casefold()))[:20]}


@api.post("/alerts/{aid}/confirm")
async def confirm_alert(aid: str, u: dict = Depends(current_user)):
    r = await db.alerts.update_one({"id": aid, "status": "aprovado", "confirmed_by": {"$ne": u["id"]}, "reporter_id": {"$ne": u["id"]}},
                                   {"$addToSet": {"confirmed_by": u["id"]}, "$inc": {"confirmations": 1}})
    if not r.matched_count:
        raise HTTPException(409, "Você já confirmou ou é o autor deste alerta")
    return {"ok": True}


class FlagIn(BaseModel):
    reason: Literal["falso", "ofensivo", "dados_pessoais", "duplicado", "outro"]


@api.post("/alerts/{aid}/flag")
async def flag_alert(aid: str, body: FlagIn, u: dict = Depends(current_user)):
    a = await db.alerts.find_one({"id": aid, "status": "aprovado"}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Alerta não encontrado")
    if a.get("reporter_id") == u["id"]:
        raise HTTPException(400, "Você não pode denunciar o próprio alerta")
    if u["id"] in a.get("flagged_by", []):
        raise HTTPException(409, "Denúncia já registrada")
    upd: dict = {"$addToSet": {"flagged_by": u["id"]}, "$inc": {"flags": 1}, "$push": {"flag_reasons": body.reason}}
    if a.get("flags", 0) + 1 >= 3:
        upd["$set"] = {"status": "pendente"}  # volta à moderação
    await db.alerts.update_one({"id": aid}, upd)
    return {"ok": True}


# ---------------------------------------------------------------- Notifications
@api.get("/notifications")
async def notifications(u: dict = Depends(current_user)):
    items = await db.notifications.find({"user_id": u["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"items": items, "unread": sum(1 for i in items if not i["read"])}


@api.post("/notifications/read")
async def read_all(u: dict = Depends(current_user)):
    await db.notifications.update_many({"user_id": u["id"]}, {"$set": {"read": True}})
    return {"ok": True}


class PushTokenIn(BaseModel):
    token: str = Field(min_length=20, max_length=300, pattern=r"^(ExponentPushToken|ExpoPushToken)\[.+\]$")


@api.post("/push/token")
async def register_push_token(body: PushTokenIn, request: Request, u: dict = Depends(current_user)):
    platform = request.headers.get("x-client-platform", "unknown")[:20]
    await db.push_tokens.update_one({"token": body.token}, {"$set": {"user_id": u["id"], "platform": platform, "updated_at": iso(now())}}, upsert=True)
    return {"ok": True}


@api.delete("/push/token")
async def remove_push_token(body: PushTokenIn, u: dict = Depends(current_user)):
    await db.push_tokens.delete_one({"token": body.token, "user_id": u["id"]})
    return {"ok": True}


class CommunityMessageIn(BaseModel):
    message: str = Field(min_length=2, max_length=500)
    topic: Literal["apoio", "trajeto", "risco", "geral"] = "geral"


class CommunityReportIn(BaseModel):
    reason: Literal["perigoso", "dados_pessoais", "assedio", "spam", "outro"]


@api.get("/community/messages")
async def list_community_messages(before: Optional[str] = None, u: dict = Depends(current_user)):
    query: dict = {"hidden": {"$ne": True}}
    if before:
        query["created_at"] = {"$lt": before}
    rows = await db.community_messages.find(query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return [{"id": row["id"], "author": row["author"], "message": row["message"], "topic": row.get("topic", "geral"), "created_at": row["created_at"],
             "is_mine": row["user_id"] == u["id"]} for row in reversed(rows)]


@api.post("/community/messages", status_code=201)
async def post_community_message(body: CommunityMessageIn, u: dict = Depends(current_user)):
    message = re.sub(r"\s+", " ", body.message).strip()
    validate_text(message)
    since = iso(now() - timedelta(minutes=1))
    if await db.community_messages.count_documents({"user_id": u["id"], "created_at": {"$gte": since}}) >= 5:
        raise HTTPException(429, "Você enviou muitas mensagens. Aguarde um minuto e tente novamente.")
    row = {"id": new_id(), "user_id": u["id"], "author": u["name"].split(" ")[0], "message": message, "topic": body.topic,
           "created_at": iso(now()), "hidden": False, "reports": 0, "reporter_ids": [], "report_reasons": []}
    await db.community_messages.insert_one(row)
    return {"id": row["id"], "author": row["author"], "message": row["message"], "topic": row["topic"], "created_at": row["created_at"], "is_mine": True}


@api.post("/community/messages/{message_id}/report")
async def report_community_message(message_id: str, body: CommunityReportIn, u: dict = Depends(current_user)):
    row = await db.community_messages.find_one({"id": message_id, "hidden": {"$ne": True}}, {"_id": 0, "user_id": 1})
    if not row:
        raise HTTPException(404, "Mensagem não encontrada")
    if row["user_id"] == u["id"]:
        raise HTTPException(400, "Você não pode denunciar sua própria mensagem")
    result = await db.community_messages.update_one(
        {"id": message_id, "reporter_ids": {"$ne": u["id"]}},
        {"$addToSet": {"reporter_ids": u["id"], "report_reasons": body.reason}, "$inc": {"reports": 1}},
    )
    if not result.modified_count:
        raise HTTPException(409, "Você já denunciou esta mensagem")
    await db.community_messages.update_one({"id": message_id, "reports": {"$gte": 3}}, {"$set": {"hidden": True}})
    return {"ok": True}


# ---------------------------------------------------------------- Plans & payments (Stripe Checkout)
DEFAULT_PLANS = [
    {"id": "gratuito", "name": "Gratuito", "price_cents": 0, "interval": "month", "order": 0,
     "features": ["Botão SOS ilimitado", "Até 3 contatos de confiança", "Compartilhar localização por 1 hora", "Mapa colaborativo e alertas"]},
    {"id": "premium_mensal", "name": "Premium Mensal", "price_cents": 1490, "interval": "month", "order": 1,
     "features": ["Tudo do Gratuito", "Até 10 contatos de confiança", "Compartilhar localização por até 8 horas", "Apoie a rede ROTA SEGURA"]},
    {"id": "premium_anual", "name": "Premium Anual", "price_cents": 14990, "interval": "year", "order": 2,
     "features": ["Tudo do Premium Mensal", "Economize 2 meses", "Prioridade no suporte"]},
]


@api.get("/plans")
async def list_plans():
    return await db.plans.find({"active": True}, {"_id": 0}).sort("order", 1).to_list(20)


class CheckoutIn(BaseModel):
    plan_id: str


def stripe_ready():
    key = os.environ.get("STRIPE_API_KEY")
    if not key:
        raise HTTPException(503, "Pagamentos ainda não configurados. Tente mais tarde.")
    stripe.api_key = key


@api.post("/payments/checkout")
async def checkout(body: CheckoutIn, request: Request, u: dict = Depends(current_user)):
    plan = await db.plans.find_one({"id": body.plan_id, "active": True}, {"_id": 0})
    if not plan or plan["price_cents"] <= 0:
        raise HTTPException(404, "Plano inválido")
    stripe_ready()
    base = os.environ["PUBLIC_BASE_URL"].rstrip("/")
    try:
        session = await asyncio.to_thread(
            stripe.checkout.Session.create,
            mode="subscription", customer_email=u["email"], locale="pt-BR",
            line_items=[{"quantity": 1, "price_data": {"currency": "brl", "unit_amount": plan["price_cents"],
                                                        "recurring": {"interval": plan["interval"]},
                                                        "product_data": {"name": f"ROTA SEGURA {plan['name']}"}}}],
            success_url=f"{base}/api/payments/return?status=ok&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{base}/api/payments/return?status=cancel",
            metadata={"user_id": u["id"], "plan_id": plan["id"]},
        )
    except stripe.error.StripeError as e:
        logger.error("Stripe error: %s", e)
        raise HTTPException(502, "Não foi possível iniciar o pagamento")
    await db.payment_transactions.insert_one({"id": new_id(), "session_id": session.id, "user_id": u["id"], "plan_id": plan["id"],
                                              "amount_cents": plan["price_cents"], "currency": "brl", "payment_status": "pendente",
                                              "created_at": iso(now())})
    return {"url": session.url, "session_id": session.id}


async def activate_if_paid(session_id: str) -> str:
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    if tx["payment_status"] == "pago":
        return "pago"
    stripe_ready()
    s = await asyncio.to_thread(stripe.checkout.Session.retrieve, session_id)
    if s.payment_status == "paid" and s.status == "complete":
        plan = await db.plans.find_one({"id": tx["plan_id"]}, {"_id": 0})
        days = 366 if plan and plan["interval"] == "year" else 31
        r = await db.payment_transactions.update_one({"session_id": session_id, "payment_status": {"$ne": "pago"}},
                                                     {"$set": {"payment_status": "pago", "subscription_id": s.subscription, "paid_at": iso(now())}})
        if r.modified_count:
            await db.users.update_one({"id": tx["user_id"]}, {"$set": {"plan": tx["plan_id"], "plan_expires_at": iso(now() + timedelta(days=days))}})
            await notify(tx["user_id"], "Assinatura ativada", f"Seu plano {plan['name'] if plan else ''} está ativo. Obrigado!", "success")
        return "pago"
    if s.status == "expired":
        await db.payment_transactions.update_one({"session_id": session_id}, {"$set": {"payment_status": "expirado"}})
        return "expirado"
    return "pendente"


@api.get("/payments/status/{session_id}")
async def payment_status(session_id: str, u: dict = Depends(current_user)):
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": u["id"]}, {"_id": 0})
    if not tx:
        raise HTTPException(404, "Transação não encontrada")
    return {"status": await activate_if_paid(session_id)}


@api.get("/payments/return", response_class=HTMLResponse)
async def payment_return(status: str = "ok", session_id: str = ""):
    if status == "ok" and session_id:
        with suppress(Exception):
            await activate_if_paid(session_id)
    msg = "Pagamento recebido! Volte ao aplicativo ROTA SEGURA." if status == "ok" else "Pagamento cancelado. Você pode voltar ao aplicativo."
    return HTMLResponse(f'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
                        f'<body style="font-family:Arial;padding:32px;background:#0B2545;color:#fff"><h2>ROTA SEGURA</h2><p style="font-size:18px">{msg}</p>'
                        f'<p>Feche esta janela para continuar.</p></body></html>')


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None, alias="Stripe-Signature")):
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(503, "Webhook não configurado")
    try:
        event = stripe.Webhook.construct_event(await request.body(), stripe_signature, secret)
    except Exception:
        raise HTTPException(400, "Assinatura inválida")
    if event["type"] == "checkout.session.completed":
        await activate_if_paid(event["data"]["object"]["id"])
    return {"received": True}


# ---------------------------------------------------------------- Admin
@api.get("/admin/stats")
async def admin_stats(_: dict = Depends(admin_user)):
    return {
        "usuarios": await db.users.count_documents({}),
        "premium": await db.users.count_documents({"plan": {"$ne": "gratuito"}, "plan_expires_at": {"$gt": iso(now())}}),
        "alertas_pendentes": await db.alerts.count_documents({"status": "pendente"}),
        "alertas_aprovados": await db.alerts.count_documents({"status": "aprovado"}),
        "sos_total": await db.incidents.count_documents({"type": "sos"}),
    }


@api.get("/admin/alerts")
async def admin_alerts(status: str = "pendente", _: dict = Depends(admin_user)):
    items = await db.alerts.find({"status": status}, {"_id": 0, "confirmed_by": 0, "flagged_by": 0}).sort("created_at", -1).to_list(200)
    return items


class ModerateIn(BaseModel):
    decision: Literal["aprovado", "rejeitado"]
    reason: str = Field(default="", max_length=200)


@api.post("/admin/alerts/{aid}/moderate")
async def moderate(aid: str, body: ModerateIn, admin: dict = Depends(admin_user)):
    a = await db.alerts.find_one({"id": aid}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Alerta não encontrado")
    await db.alerts.update_one({"id": aid}, {"$set": {"status": body.decision, "moderated_by": admin["id"],
                                                      "moderated_at": iso(now()), "moderation_reason": body.reason}})
    if a.get("reporter_id"):
        if body.decision == "aprovado":
            await notify(a["reporter_id"], "Seu alerta foi publicado", "Obrigado por ajudar outros motoristas.", "success")
        else:
            await notify(a["reporter_id"], "Seu alerta não foi publicado", body.reason or "Não atende às regras da comunidade.", "warning")
    return {"ok": True}


@api.get("/admin/community/messages")
async def admin_community_messages(_: dict = Depends(admin_user)):
    rows = await db.community_messages.find({"moderation_decision": {"$exists": False},
                                            "$or": [{"reports": {"$gt": 0}}, {"hidden": True}]},
                                            {"_id": 0, "reporter_ids": 0}).sort("created_at", -1).to_list(300)
    return rows


class CommunityModerateIn(BaseModel):
    decision: Literal["manter", "ocultar"]


@api.post("/admin/community/messages/{message_id}/moderate")
async def moderate_community_message(message_id: str, body: CommunityModerateIn, admin: dict = Depends(admin_user)):
    row = await db.community_messages.find_one({"id": message_id})
    if not row:
        raise HTTPException(404, "Publicação não encontrada")
    await db.community_messages.update_one({"id": message_id}, {"$set": {
        "hidden": body.decision == "ocultar", "reports": 0, "reporter_ids": [], "report_reasons": [],
        "moderated_by": admin["id"], "moderated_at": iso(now()),
        "moderation_decision": body.decision,
    }})
    return {"ok": True}


@api.get("/admin/users")
async def admin_users(_: dict = Depends(admin_user)):
    us = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(500)
    return [public_user(x) | {"blocked": x.get("blocked", False)} for x in us]


class BlockIn(BaseModel):
    blocked: bool


@api.post("/admin/users/{uid}/block")
async def block_user(uid: str, body: BlockIn, admin: dict = Depends(admin_user)):
    if uid == admin["id"]:
        raise HTTPException(400, "Você não pode bloquear a si mesmo")
    await db.users.update_one({"id": uid}, {"$set": {"blocked": body.blocked}})
    return {"ok": True}


class PlanEditIn(BaseModel):
    price_cents: int = Field(ge=0, le=1_000_000)
    name: str = Field(min_length=2, max_length=40)


@api.put("/admin/plans/{pid}")
async def edit_plan(pid: str, body: PlanEditIn, _: dict = Depends(admin_user)):
    if pid == "gratuito" and body.price_cents != 0:
        raise HTTPException(400, "O plano gratuito deve custar R$ 0,00")
    r = await db.plans.update_one({"id": pid}, {"$set": body.model_dump()})
    if not r.matched_count:
        raise HTTPException(404, "Plano não encontrado")
    return {"ok": True}


class AuthorityIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    keyword: str = Field(min_length=3, max_length=60)


@api.get("/admin/authorities")
async def admin_authorities(_: dict = Depends(admin_user)):
    items = await db.authorities.find({}, {"_id": 0, "keyword_hash": 0}).sort("name", 1).to_list(200)
    return items


@api.post("/admin/authorities", status_code=201)
async def add_authority(body: AuthorityIn, _: dict = Depends(admin_user)):
    name = body.name.strip()
    normalized = re.sub(r"\s+", " ", body.keyword.strip())
    if len(normalized) < 3:
        raise HTTPException(422, "A palavra-chave precisa ter ao menos 3 caracteres")
    item = {"id": new_id(), "name": name, "keyword_hash": hash_authority_keyword(normalized),
            "integration_status": "not_configured", "created_at": iso(now()), "updated_at": iso(now())}
    await db.authorities.insert_one(item)
    return {"id": item["id"], "name": name, "integration_status": item["integration_status"], "created_at": item["created_at"]}


@api.put("/admin/authorities/{authority_id}")
async def update_authority(authority_id: str, body: AuthorityIn, _: dict = Depends(admin_user)):
    name = body.name.strip()
    normalized = re.sub(r"\s+", " ", body.keyword.strip())
    if len(normalized) < 3:
        raise HTTPException(422, "A palavra-chave precisa ter ao menos 3 caracteres")
    hashed = hash_authority_keyword(normalized)
    result = await db.authorities.update_one({"id": authority_id}, {"$set": {"name": name, "keyword_hash": hashed, "updated_at": iso(now())}})
    if not result.matched_count:
        raise HTTPException(404, "Autoridade não encontrada")
    return {"ok": True}


@api.delete("/admin/authorities/{authority_id}")
async def delete_authority(authority_id: str, _: dict = Depends(admin_user)):
    result = await db.authorities.delete_one({"id": authority_id})
    if not result.deleted_count:
        raise HTTPException(404, "Autoridade não encontrada")
    return {"ok": True}


@api.get("/admin/feedback")
async def admin_feedback(_: dict = Depends(admin_user)):
    items = await db.feedback.find({}, {"_id": 0, "user_id": 0}).sort("created_at", -1).to_list(500)
    return items


app.include_router(api)
app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


async def seed():
    for p in DEFAULT_PLANS:
        await db.plans.update_one({"id": p["id"]}, {"$setOnInsert": {**p, "active": True}}, upsert=True)
    email = os.environ["ADMIN_EMAIL"].lower()
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({"id": new_id(), "name": "Administrador", "email": email, "password_hash": hash_pw(os.environ["ADMIN_PASSWORD"]),
                                   "phone": "", "driver_type": "profissional", "role": "admin", "plan": "gratuito", "plan_expires_at": None,
                                   "blocked": False, "lgpd_consent_at": iso(now()), "location_consent": False, "created_at": iso(now())})
    elif not verify_pw(os.environ["ADMIN_PASSWORD"], existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_pw(os.environ["ADMIN_PASSWORD"]), "role": "admin"}})


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    await seed()


@app.on_event("shutdown")
async def shutdown():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    client.close()
