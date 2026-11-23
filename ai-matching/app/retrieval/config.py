from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field, model_validator

WEIGHTS_PATH = Path(__file__).resolve().parent / "weights.yaml"


class Weights(BaseModel):
    hybrid: float = Field(ge=0)
    skill: float = Field(ge=0)
    level: float = Field(ge=0)
    exp: float = Field(ge=0)
    salary: float = Field(ge=0)
    recency: float = Field(ge=0)

    @model_validator(mode="after")
    def _sum_to_one(self) -> "Weights":
        total = sum(self.model_dump().values())
        if abs(total - 1.0) > 1e-6:
            raise ValueError(f"Tổng trọng số phải bằng 1, đang là {total}")
        return self


class RetrievalConfig(BaseModel):
    weights: Weights
    min_skill_score: float = Field(ge=0, le=1)
    tau: float = Field(ge=0, le=1)
    nice_to_have_bonus: float = Field(ge=0)
    prefetch_limit: int = Field(gt=0)
    fusion_limit: int = Field(gt=0)
    max_per_company: int = Field(gt=0)
    recency_days: float = Field(gt=0)
    thin_cv_min_skills: int = Field(ge=0)
    fallback_newest_limit: int = Field(ge=0)

    @classmethod
    def from_yaml(cls, path: Path) -> "RetrievalConfig":
        with path.open(encoding="utf-8") as f:
            return cls.model_validate(yaml.safe_load(f))


@lru_cache
def get_retrieval_config() -> RetrievalConfig:
    return RetrievalConfig.from_yaml(WEIGHTS_PATH)
