import os
import json
from typing import Dict, Any, Optional, List
import aioboto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

class BedrockService:
    """AWS Bedrock service for AI-powered features"""
    
    def __init__(self):
        self.region = os.getenv("BEDROCK_REGION", "us-east-1")
        self.model_id = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-sonnet-20240229-v1:0")
        self.max_tokens = 1000
        self.temperature = 0.7
    
    async def generate_response(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Generate a response using AWS Bedrock"""
        try:
            # Prepare the messages
            messages = []
            if system_prompt:
                messages.append({
                    "role": "user",
                    "content": [{"type": "text", "text": f"System: {system_prompt}\n\nUser: {prompt}"}]
                })
            else:
                messages.append({
                    "role": "user",
                    "content": [{"type": "text", "text": prompt}]
                })
            
            # Prepare the request body
            request_body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "messages": messages
            }
            
            session = aioboto3.Session()
            async with session.client('bedrock-runtime', region_name=self.region) as bedrock:
                response = await bedrock.invoke_model(
                    modelId=self.model_id,
                    body=json.dumps(request_body),
                    contentType='application/json'
                )
                
                response_body = json.loads(await response['body'].read())
                return response_body['content'][0]['text']
                
        except ClientError as e:
            print(f"Bedrock API error: {e}")
            return "I'm sorry, I'm having trouble processing your request right now. Please try again later."
        except Exception as e:
            print(f"Error generating response: {e}")
            return "I'm sorry, I'm having trouble processing your request right now. Please try again later."
    
    async def generate_leave_suggestion(self, start_date: str, end_date: str, employee_name: str) -> Dict[str, Any]:
        """Generate AI-powered leave suggestions"""
        system_prompt = """You are an HR assistant helping employees with leave planning. 
        Provide helpful suggestions based on the leave dates and employee information. 
        Consider factors like weekends, holidays, and work-life balance."""
        
        prompt = f"""
        Employee: {employee_name}
        Leave Start Date: {start_date}
        Leave End Date: {end_date}
        
        Please provide a helpful suggestion for this leave request. Consider:
        1. If extending the leave would provide better work-life balance
        2. If there are any nearby holidays or weekends that could be included
        3. Any general advice for the employee
        
        Respond in JSON format with:
        - show: boolean (whether to show the suggestion)
        - message: string (the suggestion message)
        - icon: string (an appropriate emoji)
        - type: string (suggestion type like "weekend_extension", "holiday_nearby", etc.)
        """
        
        try:
            response = await self.generate_response(prompt, system_prompt)
            # Try to parse as JSON, fallback to default if parsing fails
            try:
                suggestion = json.loads(response)
                return suggestion
            except json.JSONDecodeError:
                return {
                    "show": True,
                    "message": response,
                    "icon": "💡",
                    "type": "general"
                }
        except Exception as e:
            print(f"Error generating leave suggestion: {e}")
            return {
                "show": False,
                "message": "",
                "icon": "",
                "type": ""
            }
    
    async def generate_recruitment_response(self, question: str, job_info: Dict[str, Any]) -> str:
        """Generate AI-powered recruitment responses"""
        system_prompt = f"""You are a helpful recruitment assistant for Zenith HR Pulse. 
        You have access to the following job information:
        - Position: {job_info.get('position', 'Not specified')}
        - Department: {job_info.get('department', 'Not specified')}
        - Requirements: {job_info.get('requirements', 'Not specified')}
        - Salary Range: {job_info.get('salary_range', 'Not specified')}
        - Work Arrangement: {job_info.get('work_arrangement', 'Not specified')}
        
        Answer candidate questions about this role professionally and helpfully."""
        
        prompt = f"Candidate Question: {question}"
        
        try:
            response = await self.generate_response(prompt, system_prompt)
            return response
        except Exception as e:
            print(f"Error generating recruitment response: {e}")
            return "Thank you for your question! I'd be happy to help you with information about this role. Please contact our HR team for more specific details."
    
    async def generate_performance_feedback(self, employee_data: Dict[str, Any], feedback_type: str) -> str:
        """Generate AI-powered performance feedback suggestions"""
        system_prompt = """You are an HR performance management assistant. 
        Generate constructive, professional feedback suggestions based on employee performance data. 
        Focus on actionable insights and development opportunities."""
        
        prompt = f"""
        Employee: {employee_data.get('name', 'Employee')}
        Position: {employee_data.get('position', 'Not specified')}
        Department: {employee_data.get('department', 'Not specified')}
        Performance Metrics: {json.dumps(employee_data.get('performance_metrics', {}))}
        Feedback Type: {feedback_type}
        
        Generate constructive feedback suggestions for this employee.
        """
        
        try:
            response = await self.generate_response(prompt, system_prompt)
            return response
        except Exception as e:
            print(f"Error generating performance feedback: {e}")
            return "Based on the performance data, I recommend focusing on continuous improvement and setting clear development goals."
    
    async def generate_goal_suggestions(self, employee_data: Dict[str, Any]) -> List[Dict[str, str]]:
        """Generate AI-powered goal suggestions for employees"""
        system_prompt = """You are an HR goal-setting assistant. 
        Generate relevant, achievable goal suggestions based on employee role, department, and performance data. 
        Focus on professional development and career growth."""
        
        prompt = f"""
        Employee: {employee_data.get('name', 'Employee')}
        Position: {employee_data.get('position', 'Not specified')}
        Department: {employee_data.get('department', 'Not specified')}
        Skills: {json.dumps(employee_data.get('skills', []))}
        Performance Areas: {json.dumps(employee_data.get('performance_areas', {}))}
        
        Generate 3-5 relevant goal suggestions in JSON format:
        [
            {{"title": "Goal Title", "description": "Goal Description", "category": "category_name"}},
            ...
        ]
        """
        
        try:
            response = await self.generate_response(prompt, system_prompt)
            # Try to extract JSON from the response (in case there's preamble or markdown)
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0].strip()
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0].strip()
            
            try:
                goals = json.loads(json_str)
                if isinstance(goals, list):
                    return goals
                elif isinstance(goals, dict) and "suggestions" in goals:
                    return goals["suggestions"]
                else:
                    return []
            except json.JSONDecodeError:
                # If direct parsing fails, try to find anything that looks like a JSON array
                import re
                match = re.search(r'\[\s*\{.*\}\s*\]', json_str, re.DOTALL)
                if match:
                    try:
                        return json.loads(match.group(0))
                    except:
                        pass
                return []
        except Exception as e:
            print(f"Error generating goal suggestions: {e}")
            return []
    
    async def analyze_employee_sentiment(self, feedback_text: str) -> Dict[str, Any]:
        """Analyze employee feedback sentiment using AI"""
        system_prompt = """You are an HR sentiment analysis assistant. 
        Analyze the sentiment of employee feedback and provide insights about employee satisfaction and engagement."""
        
        prompt = f"""
        Employee Feedback: {feedback_text}
        
        Analyze this feedback and provide:
        1. Overall sentiment (positive, negative, neutral)
        2. Key themes mentioned
        3. Suggested actions for HR
        
        Respond in JSON format:
        {{
            "sentiment": "positive/negative/neutral",
            "confidence": 0.0-1.0,
            "themes": ["theme1", "theme2"],
            "suggested_actions": ["action1", "action2"]
        }}
        """
        
        try:
            response = await self.generate_response(prompt, system_prompt)
            # Try to parse as JSON, fallback to default if parsing fails
            try:
                analysis = json.loads(response)
                return analysis
            except json.JSONDecodeError:
                return {
                    "sentiment": "neutral",
                    "confidence": 0.5,
                    "themes": ["general feedback"],
                    "suggested_actions": ["Follow up with employee"]
                }
        except Exception as e:
            print(f"Error analyzing sentiment: {e}")
            return {
                "sentiment": "neutral",
                "confidence": 0.5,
                "themes": ["general feedback"],
                "suggested_actions": ["Follow up with employee"]
            }

# Global Bedrock service instance
bedrock_service = BedrockService()

# Initialize Bedrock service
async def initialize_bedrock():
    """Initialize Bedrock service"""
    try:
        # Test the service with a simple request
        test_response = await bedrock_service.generate_response("Hello, this is a test.")
        if test_response:
            print("Bedrock service initialized successfully")
        else:
            print("Bedrock service initialization failed - no response received")
    except Exception as e:
        print(f"Bedrock service initialization failed: {e}")
        print("AI features will not work until Bedrock is properly configured")
