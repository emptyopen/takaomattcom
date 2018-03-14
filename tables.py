# Matt Takao 2018-01-19

# define search results table

from flask_table import Table, Col, LinkCol

class Results(Table):
    sale_number = Col('Sale Number', show=False)
    vin = Col('Vehicle Identification Number (VIN)')
    make = Col('Make')
    model = Col('Model')
    year = Col('Year')
    price = Col('Price')
    buyer = Col('Buyer')
    seller = Col('Seller')
    date_of_sale = Col('Date of Sale')
    edit = LinkCol('Edit', 'edit_sale',
            url_kwargs=dict(sale_number='sale_number'))
    delete = LinkCol('Delete', 'delete_sale',
            url_kwargs=dict(sale_number='sale_number'))
