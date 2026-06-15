import openai

def generate_hashtags(text):
    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "Generate social media hashtags"},
            {"role": "user", "content": text}
        ]
    )

    return response["choices"][0]["message"]["content"]