from fastapi import APIRouter, HTTPException, Body, Depends
from typing import Dict, Any, Optional
from ..services.bedrock_service import bedrock_service
from ..security import get_current_active_user

router = APIRouter(
    prefix="/api/ai",
    tags=["ai"],
    responses={404: {"description": "Not found"}},
)

@router.post("/chat")
async def ai_chat(
    message: str = Body(..., embed=True),
    context: Optional[str] = Body(None, embed=True),
    current_user: dict = Depends(get_current_active_user)
):
    """General AI chat endpoint"""
    try:
        system_prompt = "You are a helpful HR assistant for Zenith HR Pulse. Provide professional and helpful responses to HR-related questions."
        
        if context:
            prompt = f"Context: {context}\n\nUser Question: {message}"
        else:
            prompt = message
        
        response = await bedrock_service.generate_response(prompt, system_prompt)
        
        return {
            "message": message,
            "response": response,
            "context": context
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate AI response: {str(e)}"
        )

@router.post("/leave-suggestion")
async def ai_leave_suggestion(
    employee_name: str = Body(..., embed=True),
    start_date: str = Body(..., embed=True),
    end_date: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_active_user)
):
    """Generate AI-powered leave suggestions"""
    try:
        suggestion = await bedrock_service.generate_leave_suggestion(
            start_date, end_date, employee_name
        )
        
        return {
            "employee_name": employee_name,
            "start_date": start_date,
            "end_date": end_date,
            "suggestion": suggestion
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate leave suggestion: {str(e)}"
        )

@router.post("/recruitment-response")
async def ai_recruitment_response(
    question: str = Body(..., embed=True),
    job_info: Dict[str, Any] = Body(..., embed=True),
    current_user: dict = Depends(get_current_active_user)
):
    """Generate AI-powered recruitment responses"""
    try:
        response = await bedrock_service.generate_recruitment_response(question, job_info)
        
        return {
            "question": question,
            "response": response,
            "job_info": job_info
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate recruitment response: {str(e)}"
        )

@router.post("/sentiment-analysis")
async def ai_sentiment_analysis(
    feedback_text: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_active_user)
):
    """Analyze employee feedback sentiment using AI"""
    try:
        analysis = await bedrock_service.analyze_employee_sentiment(feedback_text)
        
        return {
            "feedback_text": feedback_text,
            "analysis": analysis
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze sentiment: {str(e)}"
        )

@router.post("/performance-insights")
async def ai_performance_insights(
    employee_data: Dict[str, Any] = Body(..., embed=True),
    current_user: dict = Depends(get_current_active_user)
):
    """Generate AI-powered performance insights"""
    try:
        system_prompt = """You are an HR performance analyst. Analyze employee performance data and provide actionable insights for improvement."""
        
        prompt = f"""
        Employee Performance Data: {employee_data}
        
        Please provide:
        1. Key strengths and areas for improvement
        2. Recommended development actions
        3. Career growth suggestions
        4. Performance trends analysis
        """
        
        insights = await bedrock_service.generate_response(prompt, system_prompt)
        
        return {
            "employee_data": employee_data,
            "insights": insights
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate performance insights: {str(e)}"
        )

@router.post("/hr-policy-query")
async def ai_hr_policy_query(
    question: str = Body(..., embed=True),
    policy_context: Optional[str] = Body(None, embed=True),
    current_user: dict = Depends(get_current_active_user)
):
    """Answer HR policy questions using AI"""
    try:
        system_prompt = """You are an HR policy expert. Provide accurate and helpful answers about HR policies, procedures, and best practices."""
        
        if policy_context:
            prompt = f"Policy Context: {policy_context}\n\nQuestion: {question}"
        else:
            prompt = question
        
        response = await bedrock_service.generate_response(prompt, system_prompt)
        
        return {
            "question": question,
            "response": response,
            "policy_context": policy_context
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to answer HR policy query: {str(e)}"
        )
